-- ═══════════════════════════════════════════════════════════════════════════
-- Loderer Dental App — Migrácia v7
-- Spusti v: Supabase Dashboard → SQL Editor → New query → Run
--
-- Čo rieši:
--   1. Stĺpec is_urgent v tabuľke appointments
--   2. Aktualizácia RPC book_appointment — prijíma p_is_urgent
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Pridaj is_urgent do appointments ─────────────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false;

-- ─── 2. Aktualizuj RPC book_appointment ──────────────────────────────────────
-- Najprv zmaž existujúce preťažené verzie
DROP FUNCTION IF EXISTS public.book_appointment(uuid, uuid, uuid, timestamptz, integer, text, text);
DROP FUNCTION IF EXISTS public.book_appointment(uuid, uuid, uuid, timestamptz, integer, text);
DROP FUNCTION IF EXISTS public.book_appointment(uuid, uuid, uuid, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.book_appointment(
  p_doctor_id        uuid,
  p_patient_id       uuid,
  p_service_id       uuid,
  p_start            timestamptz,
  p_duration_minutes integer,
  p_notes            text    DEFAULT NULL,
  p_status           text    DEFAULT 'pending',
  p_is_urgent        boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_end    timestamptz := p_start + (p_duration_minutes || ' minutes')::interval;
  v_exists boolean;
BEGIN
  -- Skontroluj prihlásenie
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  -- Skontroluj konflikty termínov
  SELECT EXISTS (
    SELECT 1 FROM public.appointments
    WHERE  doctor_id = p_doctor_id
      AND  status    IN ('scheduled', 'pending')
      AND  appointment_date < v_end
      AND  appointment_date + (COALESCE(custom_duration_minutes,
             (SELECT duration_minutes FROM public.services WHERE id = service_id), 30
           ) || ' minutes')::interval > p_start
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  INSERT INTO public.appointments
    (doctor_id, patient_id, service_id, appointment_date, custom_duration_minutes, notes, status, is_urgent)
  VALUES
    (p_doctor_id, p_patient_id, p_service_id, p_start, p_duration_minutes, p_notes, p_status, p_is_urgent);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── 3. Overenie ─────────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default
FROM   information_schema.columns
WHERE  table_name = 'appointments' AND column_name = 'is_urgent';

-- ═══════════════════════════════════════════════════════════════════════════
-- HOTOVO:
--   ✅ appointments.is_urgent — boolean, NOT NULL, DEFAULT false
--   ✅ book_appointment RPC — akceptuje p_is_urgent parameter
-- ═══════════════════════════════════════════════════════════════════════════
