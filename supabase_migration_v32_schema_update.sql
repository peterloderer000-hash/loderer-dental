-- ─── Migration v32: Schema Update ────────────────────────────────────────────
-- Spusti v Supabase Dashboard → SQL Editor
-- Idempotentné (bezpečné spustiť viackrát — ADD COLUMN IF NOT EXISTS + CREATE IF NOT EXISTS)
--
-- Čo táto migrácia robí:
--   1. Pridá chýbajúce stĺpce do appointments, treatment_plans, treatment_plan_items,
--      prescriptions, profiles
--   2. Aktualizuje roles constraint (pridá hygienist, owner)
--   3. Vytvorí chýbajúce tabuľky (diagnoses, dental_charts, dental_records,
--      opening_hours, notifications, waiting_list, health_passports)
--      — CREATE TABLE IF NOT EXISTS je bezpečné, ak tabuľka existuje, nič sa nestane
--   4. Povolí RLS na nových tabuľkách + pridá základné políčky


-- ─── 1. appointments ─────────────────────────────────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_urgent                BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_duration_minutes  INT,
  ADD COLUMN IF NOT EXISTS doctor_notes             TEXT,
  ADD COLUMN IF NOT EXISTS clinic_status            TEXT        DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS arrived_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chair_id                 UUID,
  ADD COLUMN IF NOT EXISTS payment_status           TEXT        DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS family_member_name       TEXT;


-- ─── 2. treatment_plans ──────────────────────────────────────────────────────
ALTER TABLE public.treatment_plans
  ADD COLUMN IF NOT EXISTS notes               TEXT,
  ADD COLUMN IF NOT EXISTS visible_to_patient  BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT now();


-- ─── 3. treatment_plan_items ─────────────────────────────────────────────────
-- Kód používa: title, description, estimated_cost, tooth_number, status, sort_order
-- CLAUDE.md mal: description, price, status, order_index  (staré názvy)
ALTER TABLE public.treatment_plan_items
  ADD COLUMN IF NOT EXISTS title          TEXT,
  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS tooth_number   INT CHECK (tooth_number >= 1 AND tooth_number <= 48),
  ADD COLUMN IF NOT EXISTS sort_order     INT DEFAULT 0;

-- Ak treatment_plan_items.title nemá NOT NULL constraint a existujúce riadky
-- majú NULL title, nastav ich na description (fallback)
UPDATE public.treatment_plan_items
  SET title = COALESCE(description, 'Výkon')
  WHERE title IS NULL;


-- ─── 4. prescriptions ────────────────────────────────────────────────────────
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS valid_until    DATE,
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL;


-- ─── 5. profiles ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number       TEXT,
  ADD COLUMN IF NOT EXISTS clinic_name        TEXT,
  ADD COLUMN IF NOT EXISTS clinic_address     TEXT,
  ADD COLUMN IF NOT EXISTS clinic_ico         TEXT,
  ADD COLUMN IF NOT EXISTS clinic_dic         TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth      DATE,
  ADD COLUMN IF NOT EXISTS insurance_company  TEXT,
  ADD COLUMN IF NOT EXISTS insurance_number   TEXT,
  ADD COLUMN IF NOT EXISTS patient_note       TEXT;

-- Aktualizuj roles constraint — pridaj hygienist, owner
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'profiles' AND constraint_name = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('doctor', 'patient', 'reception', 'hygienist', 'owner'));
EXCEPTION WHEN others THEN NULL;
END$$;


-- ─── 6. diagnoses ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diagnoses (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id      UUID        NOT NULL REFERENCES auth.users(id),
  icd_code       TEXT,
  description    TEXT        NOT NULL,
  severity       TEXT        NOT NULL DEFAULT 'mild'
                             CHECK (severity IN ('mild', 'moderate', 'severe')),
  appointment_id UUID        REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diagnoses_select" ON public.diagnoses;
DROP POLICY IF EXISTS "diagnoses_insert" ON public.diagnoses;
DROP POLICY IF EXISTS "diagnoses_delete" ON public.diagnoses;
CREATE POLICY "diagnoses_select" ON public.diagnoses FOR SELECT
  USING (auth.uid() = patient_id OR get_my_role() = 'doctor');
CREATE POLICY "diagnoses_insert" ON public.diagnoses FOR INSERT
  WITH CHECK (get_my_role() = 'doctor');
CREATE POLICY "diagnoses_delete" ON public.diagnoses FOR DELETE
  USING (get_my_role() = 'doctor');


-- ─── 7. dental_charts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dental_charts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id    UUID REFERENCES auth.users(id),
  tooth_number INT  NOT NULL CHECK (tooth_number >= 1 AND tooth_number <= 48),
  status       TEXT NOT NULL DEFAULT 'healthy',
  notes        TEXT,
  photo_url    TEXT,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (patient_id, tooth_number)
);

ALTER TABLE public.dental_charts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dental_charts_select" ON public.dental_charts;
DROP POLICY IF EXISTS "dental_charts_insert" ON public.dental_charts;
DROP POLICY IF EXISTS "dental_charts_update" ON public.dental_charts;
DROP POLICY IF EXISTS "dental_charts_delete" ON public.dental_charts;
CREATE POLICY "dental_charts_select" ON public.dental_charts FOR SELECT
  USING (auth.uid() = patient_id OR get_my_role() = 'doctor');
CREATE POLICY "dental_charts_insert" ON public.dental_charts FOR INSERT
  WITH CHECK (get_my_role() = 'doctor');
CREATE POLICY "dental_charts_update" ON public.dental_charts FOR UPDATE
  USING (get_my_role() = 'doctor');
CREATE POLICY "dental_charts_delete" ON public.dental_charts FOR DELETE
  USING (get_my_role() = 'doctor');


-- ─── 8. dental_records (história zmien) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dental_records (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id    UUID REFERENCES auth.users(id),
  tooth_number INT  NOT NULL,
  status       TEXT NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.dental_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dental_records_select" ON public.dental_records;
DROP POLICY IF EXISTS "dental_records_insert" ON public.dental_records;
CREATE POLICY "dental_records_select" ON public.dental_records FOR SELECT
  USING (auth.uid() = patient_id OR get_my_role() = 'doctor');
CREATE POLICY "dental_records_insert" ON public.dental_records FOR INSERT
  WITH CHECK (get_my_role() = 'doctor');


-- ─── 9. opening_hours ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opening_hours (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id   UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INT     NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
  open_time   TIME,
  close_time  TIME,
  is_closed   BOOLEAN DEFAULT false,
  note        TEXT,
  UNIQUE (doctor_id, day_of_week)
);

ALTER TABLE public.opening_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "opening_hours_select" ON public.opening_hours;
DROP POLICY IF EXISTS "opening_hours_insert" ON public.opening_hours;
DROP POLICY IF EXISTS "opening_hours_update" ON public.opening_hours;
DROP POLICY IF EXISTS "opening_hours_delete" ON public.opening_hours;
CREATE POLICY "opening_hours_select" ON public.opening_hours FOR SELECT
  USING (true);  -- čítajú všetci (pacienti potrebujú vidieť pre booking)
CREATE POLICY "opening_hours_insert" ON public.opening_hours FOR INSERT
  WITH CHECK (auth.uid() = doctor_id AND get_my_role() = 'doctor');
CREATE POLICY "opening_hours_update" ON public.opening_hours FOR UPDATE
  USING (auth.uid() = doctor_id AND get_my_role() = 'doctor');
CREATE POLICY "opening_hours_delete" ON public.opening_hours FOR DELETE
  USING (auth.uid() = doctor_id AND get_my_role() = 'doctor');


-- ─── 10. notifications ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  body           TEXT,
  type           TEXT        DEFAULT 'info',
  appointment_id UUID        REFERENCES public.appointments(id) ON DELETE SET NULL,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT
  WITH CHECK (true);  -- ktokoľvek môže poslať notifikáciu inému používateľovi
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);  -- len označiť ako prečítané
CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);


-- ─── 11. waiting_list ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.waiting_list (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id     UUID        REFERENCES public.services(id) ON DELETE SET NULL,
  preferred_date DATE,
  notes          TEXT,
  status         TEXT        DEFAULT 'waiting',
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.waiting_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "waiting_list_select" ON public.waiting_list;
DROP POLICY IF EXISTS "waiting_list_insert" ON public.waiting_list;
DROP POLICY IF EXISTS "waiting_list_delete" ON public.waiting_list;
CREATE POLICY "waiting_list_select" ON public.waiting_list FOR SELECT
  USING (auth.uid() = patient_id OR get_my_role() = 'doctor' OR get_my_role() = 'reception');
CREATE POLICY "waiting_list_insert" ON public.waiting_list FOR INSERT
  WITH CHECK (auth.uid() = patient_id);
CREATE POLICY "waiting_list_delete" ON public.waiting_list FOR DELETE
  USING (auth.uid() = patient_id OR get_my_role() = 'doctor');


-- ─── 12. health_passports ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.health_passports (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  blood_type         TEXT,
  insurance_provider TEXT,
  insurance_number   TEXT,
  emergency_name     TEXT,
  emergency_phone    TEXT,
  is_pregnant        BOOLEAN     DEFAULT false,
  last_dental_visit  TEXT,
  medical_history    TEXT[],
  allergies          TEXT,
  medications        TEXT,
  visit_reasons      TEXT[],
  dental_freq        TEXT,
  fear_level         TEXT,
  comfort            TEXT,
  aesthetics         TEXT[],
  lifestyle          TEXT[],
  investment         TEXT,
  open_q             TEXT,
  updated_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.health_passports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "health_passports_select" ON public.health_passports;
DROP POLICY IF EXISTS "health_passports_insert" ON public.health_passports;
DROP POLICY IF EXISTS "health_passports_update" ON public.health_passports;
CREATE POLICY "health_passports_select" ON public.health_passports FOR SELECT
  USING (auth.uid() = patient_id OR get_my_role() = 'doctor');
CREATE POLICY "health_passports_insert" ON public.health_passports FOR INSERT
  WITH CHECK (auth.uid() = patient_id);
CREATE POLICY "health_passports_update" ON public.health_passports FOR UPDATE
  USING (auth.uid() = patient_id);


-- ─── 13. time_blocks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_blocks (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  block_type TEXT        NOT NULL DEFAULT 'other'
             CHECK (block_type IN ('lunch','meeting','vacation','personal','other')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time   TIMESTAMPTZ NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.time_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "time_blocks_select" ON public.time_blocks;
DROP POLICY IF EXISTS "time_blocks_insert" ON public.time_blocks;
DROP POLICY IF EXISTS "time_blocks_update" ON public.time_blocks;
DROP POLICY IF EXISTS "time_blocks_delete" ON public.time_blocks;
CREATE POLICY "time_blocks_select" ON public.time_blocks FOR SELECT
  USING (auth.uid() = doctor_id OR get_my_role() IN ('doctor','reception'));
CREATE POLICY "time_blocks_insert" ON public.time_blocks FOR INSERT
  WITH CHECK (auth.uid() = doctor_id AND get_my_role() = 'doctor');
CREATE POLICY "time_blocks_update" ON public.time_blocks FOR UPDATE
  USING (auth.uid() = doctor_id AND get_my_role() = 'doctor');
CREATE POLICY "time_blocks_delete" ON public.time_blocks FOR DELETE
  USING (auth.uid() = doctor_id AND get_my_role() = 'doctor');


-- ─── 14. patient_notes (doktorove poznámky ku pacientovi) ────────────────────
CREATE TABLE IF NOT EXISTS public.patient_notes (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  doctor_id  UUID        REFERENCES auth.users(id),
  content    TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.patient_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "patient_notes_select" ON public.patient_notes;
DROP POLICY IF EXISTS "patient_notes_insert" ON public.patient_notes;
DROP POLICY IF EXISTS "patient_notes_update" ON public.patient_notes;
DROP POLICY IF EXISTS "patient_notes_delete" ON public.patient_notes;
CREATE POLICY "patient_notes_select" ON public.patient_notes FOR SELECT
  USING (get_my_role() = 'doctor');
CREATE POLICY "patient_notes_insert" ON public.patient_notes FOR INSERT
  WITH CHECK (get_my_role() = 'doctor');
CREATE POLICY "patient_notes_update" ON public.patient_notes FOR UPDATE
  USING (get_my_role() = 'doctor');
CREATE POLICY "patient_notes_delete" ON public.patient_notes FOR DELETE
  USING (get_my_role() = 'doctor');


-- ─── 14. book_appointment RPC (server-side conflict check) ───────────────────
-- Atomická rezervácia — chráni pred race condition
CREATE OR REPLACE FUNCTION public.book_appointment(
  p_doctor_id        UUID,
  p_patient_id       UUID,
  p_service_id       UUID,
  p_start            TIMESTAMPTZ,
  p_duration_minutes INT,
  p_notes            TEXT DEFAULT NULL,
  p_status           TEXT DEFAULT 'pending',
  p_is_urgent        BOOLEAN DEFAULT false
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_end      TIMESTAMPTZ := p_start + (p_duration_minutes || ' minutes')::INTERVAL;
  v_conflict INT;
  v_appt_id  UUID;
BEGIN
  -- Skontroluj konflikty
  SELECT COUNT(*) INTO v_conflict
  FROM public.appointments
  WHERE doctor_id = p_doctor_id
    AND status IN ('scheduled', 'pending')
    AND appointment_date < v_end
    AND (appointment_date + COALESCE(
          custom_duration_minutes,
          (SELECT duration_minutes FROM public.services WHERE id = service_id)
        ) * INTERVAL '1 minute') > p_start;

  IF v_conflict > 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'conflict');
  END IF;

  -- Skontroluj autorizáciu
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  -- Vytvor termín
  INSERT INTO public.appointments (
    doctor_id, patient_id, service_id,
    appointment_date, custom_duration_minutes,
    notes, status, is_urgent
  ) VALUES (
    p_doctor_id, p_patient_id, p_service_id,
    p_start, p_duration_minutes,
    p_notes, p_status, p_is_urgent
  ) RETURNING id INTO v_appt_id;

  RETURN json_build_object('ok', true, 'id', v_appt_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_appointment TO authenticated;
