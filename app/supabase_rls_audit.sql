-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase_rls_audit.sql
-- Loderer Dental App — RLS Audit & Fix
-- Generované: 2026-04-21
--
-- Spustenie: Supabase Dashboard → SQL Editor → Run
-- Poradie je dôležité: najprv helper funkcia, potom tabuľky.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- HELPER: get_my_role()
--
-- Číta rolu prihláseného používateľa z profiles BEZ RLS rekurzie.
-- SECURITY DEFINER = funkcia beží s právami vlastníka (postgres),
-- čím obchádza RLS na samotnej tabuľke profiles.
-- STABLE + SET search_path = výkonnostné best-practice od Supabase.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. APPOINTMENTS
--    patient_id  → vlastník záznamu (pacient)
--    doctor_id   → ošetrujúci doktor
--
--    SELECT  : pacient vidí len svoje | doktor vidí všetky
--    INSERT  : doktor (pre ľubovoľného pacienta) | pacient (len seba)
--    UPDATE  : doktor | pacient (napr. zrušenie vlastného termínu)
--    DELETE  : len doktor
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointments_select" ON public.appointments;
DROP POLICY IF EXISTS "appointments_insert" ON public.appointments;
DROP POLICY IF EXISTS "appointments_update" ON public.appointments;
DROP POLICY IF EXISTS "appointments_delete" ON public.appointments;

CREATE POLICY "appointments_select" ON public.appointments
  FOR SELECT USING (
    auth.uid() = patient_id
    OR get_my_role() = 'doctor'
  );

CREATE POLICY "appointments_insert" ON public.appointments
  FOR INSERT WITH CHECK (
    get_my_role() = 'doctor'
    OR (get_my_role() = 'patient' AND auth.uid() = patient_id)
  );

CREATE POLICY "appointments_update" ON public.appointments
  FOR UPDATE USING (
    get_my_role() = 'doctor'
    OR (get_my_role() = 'patient' AND auth.uid() = patient_id)
  );

CREATE POLICY "appointments_delete" ON public.appointments
  FOR DELETE USING (get_my_role() = 'doctor');


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. PROFILES
--    id   → PK = auth.uid() prihláseného používateľa
--    role → 'doctor' | 'patient'
--
--    SELECT  : každý vidí len seba | doktor vidí všetky profily
--    INSERT  : len vlastný profil (setup-role pri prvom prihlásení)
--    UPDATE  : len vlastný profil (avatar, telefón, ...)
--    DELETE  : zakázané — profily sa nemažú cez app
--
--    POZOR NA REKURZIU: get_my_role() číta profiles cez SECURITY DEFINER,
--    takže RLS sa na tú vnútornú SELECT neaplikuje → žiadna nekonečná slučka.
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR get_my_role() = 'doctor'
  );

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. NOTIFICATIONS
--    user_id → príjemca notifikácie
--
--    SELECT  : každý vidí len SVOJE notifikácie
--    INSERT  : každý prihlásený môže vytvoriť (doktor → pacient, pacient → doktor)
--    UPDATE  : len vlastník (označenie ako prečítané)
--    DELETE  : len vlastník
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. TREATMENT_PLANS
--    patient_id → vlastník plánu
--    doctor_id  → vytvárajúci doktor
--
--    SELECT  : pacient vidí len svoje | doktor vidí všetky
--    INSERT  : len doktor
--    UPDATE  : len doktor
--    DELETE  : len doktor
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "treatment_plans_select" ON public.treatment_plans;
DROP POLICY IF EXISTS "treatment_plans_insert" ON public.treatment_plans;
DROP POLICY IF EXISTS "treatment_plans_update" ON public.treatment_plans;
DROP POLICY IF EXISTS "treatment_plans_delete" ON public.treatment_plans;

CREATE POLICY "treatment_plans_select" ON public.treatment_plans
  FOR SELECT USING (
    auth.uid() = patient_id
    OR get_my_role() = 'doctor'
  );

CREATE POLICY "treatment_plans_insert" ON public.treatment_plans
  FOR INSERT WITH CHECK (get_my_role() = 'doctor');

CREATE POLICY "treatment_plans_update" ON public.treatment_plans
  FOR UPDATE USING (get_my_role() = 'doctor');

CREATE POLICY "treatment_plans_delete" ON public.treatment_plans
  FOR DELETE USING (get_my_role() = 'doctor');


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4b. TREATMENT_PLAN_ITEMS
--     plan_id → FK do treatment_plans
--     Prístup sa dedí cez parent plán (EXISTS subquery).
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.treatment_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "treatment_plan_items_select" ON public.treatment_plan_items;
DROP POLICY IF EXISTS "treatment_plan_items_insert" ON public.treatment_plan_items;
DROP POLICY IF EXISTS "treatment_plan_items_update" ON public.treatment_plan_items;
DROP POLICY IF EXISTS "treatment_plan_items_delete" ON public.treatment_plan_items;

CREATE POLICY "treatment_plan_items_select" ON public.treatment_plan_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.treatment_plans tp
      WHERE tp.id = treatment_plan_items.plan_id
        AND (tp.patient_id = auth.uid() OR get_my_role() = 'doctor')
    )
  );

CREATE POLICY "treatment_plan_items_insert" ON public.treatment_plan_items
  FOR INSERT WITH CHECK (get_my_role() = 'doctor');

CREATE POLICY "treatment_plan_items_update" ON public.treatment_plan_items
  FOR UPDATE USING (get_my_role() = 'doctor');

CREATE POLICY "treatment_plan_items_delete" ON public.treatment_plan_items
  FOR DELETE USING (get_my_role() = 'doctor');


-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. MESSAGES
--    sender_id   → odosielateľ
--    receiver_id → príjemca
--
--    SELECT  : len ak je user odosielateľ ALEBO príjemca
--    INSERT  : sender_id musí byť auth.uid() (nelze posielať za niekoho iného)
--    UPDATE  : odosielateľ aj príjemca (napr. is_read)
--    DELETE  : zakázané — správy sa nemažú (audit trail)
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;
DROP POLICY IF EXISTS "messages_delete" ON public.messages;

CREATE POLICY "messages_select" ON public.messages
  FOR SELECT USING (
    auth.uid() = sender_id
    OR auth.uid() = receiver_id
  );

CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE USING (
    auth.uid() = sender_id
    OR auth.uid() = receiver_id
  );

-- DELETE politika záměrně chýba → žiadny row nie je deletovateľný


-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. PRESCRIPTIONS
--    patient_id → pacient ktorému bol vydaný recept
--    doctor_id  → vydávajúci doktor
--
--    SELECT  : pacient vidí len svoje | doktor vidí všetky
--    INSERT  : len doktor
--    UPDATE  : len doktor (napr. is_active toggle)
--    DELETE  : len doktor
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prescriptions_select" ON public.prescriptions;
DROP POLICY IF EXISTS "prescriptions_insert" ON public.prescriptions;
DROP POLICY IF EXISTS "prescriptions_update" ON public.prescriptions;
DROP POLICY IF EXISTS "prescriptions_delete" ON public.prescriptions;

CREATE POLICY "prescriptions_select" ON public.prescriptions
  FOR SELECT USING (
    auth.uid() = patient_id
    OR get_my_role() = 'doctor'
  );

CREATE POLICY "prescriptions_insert" ON public.prescriptions
  FOR INSERT WITH CHECK (get_my_role() = 'doctor');

CREATE POLICY "prescriptions_update" ON public.prescriptions
  FOR UPDATE USING (get_my_role() = 'doctor');

CREATE POLICY "prescriptions_delete" ON public.prescriptions
  FOR DELETE USING (get_my_role() = 'doctor');


-- ═══════════════════════════════════════════════════════════════════════════════
-- BONUS: Ostatné tabuľky identifikované v kóde aplikácie
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── DIAGNOSES ─────────────────────────────────────────────────────────────────
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diagnoses_select" ON public.diagnoses;
DROP POLICY IF EXISTS "diagnoses_insert" ON public.diagnoses;
DROP POLICY IF EXISTS "diagnoses_update" ON public.diagnoses;
DROP POLICY IF EXISTS "diagnoses_delete" ON public.diagnoses;

CREATE POLICY "diagnoses_select" ON public.diagnoses
  FOR SELECT USING (auth.uid() = patient_id OR get_my_role() = 'doctor');
CREATE POLICY "diagnoses_insert" ON public.diagnoses
  FOR INSERT WITH CHECK (get_my_role() = 'doctor');
CREATE POLICY "diagnoses_update" ON public.diagnoses
  FOR UPDATE USING (get_my_role() = 'doctor');
CREATE POLICY "diagnoses_delete" ON public.diagnoses
  FOR DELETE USING (get_my_role() = 'doctor');


-- ── DENTAL_CHARTS ─────────────────────────────────────────────────────────────
ALTER TABLE public.dental_charts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dental_charts_select" ON public.dental_charts;
DROP POLICY IF EXISTS "dental_charts_insert" ON public.dental_charts;
DROP POLICY IF EXISTS "dental_charts_update" ON public.dental_charts;
DROP POLICY IF EXISTS "dental_charts_delete" ON public.dental_charts;

CREATE POLICY "dental_charts_select" ON public.dental_charts
  FOR SELECT USING (auth.uid() = patient_id OR get_my_role() = 'doctor');
CREATE POLICY "dental_charts_insert" ON public.dental_charts
  FOR INSERT WITH CHECK (get_my_role() = 'doctor');
CREATE POLICY "dental_charts_update" ON public.dental_charts
  FOR UPDATE USING (get_my_role() = 'doctor');
CREATE POLICY "dental_charts_delete" ON public.dental_charts
  FOR DELETE USING (get_my_role() = 'doctor');


-- ── HEALTH_PASSPORTS ──────────────────────────────────────────────────────────
-- Pacient si sám vypĺňa zdravotný dotazník (INSERT/UPDATE vlastného záznamu).
-- Doktor číta pre všetkých pacientov.
ALTER TABLE public.health_passports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_passports_select" ON public.health_passports;
DROP POLICY IF EXISTS "health_passports_insert" ON public.health_passports;
DROP POLICY IF EXISTS "health_passports_update" ON public.health_passports;

CREATE POLICY "health_passports_select" ON public.health_passports
  FOR SELECT USING (auth.uid() = patient_id OR get_my_role() = 'doctor');
CREATE POLICY "health_passports_insert" ON public.health_passports
  FOR INSERT WITH CHECK (auth.uid() = patient_id);
CREATE POLICY "health_passports_update" ON public.health_passports
  FOR UPDATE USING (auth.uid() = patient_id OR get_my_role() = 'doctor');


-- ── CONSENT_FORMS (šablóny súhlasov — doktor spravuje) ────────────────────────
ALTER TABLE public.consent_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consent_forms_select" ON public.consent_forms;
DROP POLICY IF EXISTS "consent_forms_insert" ON public.consent_forms;
DROP POLICY IF EXISTS "consent_forms_update" ON public.consent_forms;
DROP POLICY IF EXISTS "consent_forms_delete" ON public.consent_forms;

CREATE POLICY "consent_forms_select" ON public.consent_forms
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "consent_forms_insert" ON public.consent_forms
  FOR INSERT WITH CHECK (get_my_role() = 'doctor');
CREATE POLICY "consent_forms_update" ON public.consent_forms
  FOR UPDATE USING (get_my_role() = 'doctor');
CREATE POLICY "consent_forms_delete" ON public.consent_forms
  FOR DELETE USING (get_my_role() = 'doctor');


-- ── PATIENT_CONSENTS (podpis súhlasu pacientom) ───────────────────────────────
ALTER TABLE public.patient_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_consents_select" ON public.patient_consents;
DROP POLICY IF EXISTS "patient_consents_insert" ON public.patient_consents;
DROP POLICY IF EXISTS "patient_consents_update" ON public.patient_consents;
DROP POLICY IF EXISTS "patient_consents_delete" ON public.patient_consents;

CREATE POLICY "patient_consents_select" ON public.patient_consents
  FOR SELECT USING (auth.uid() = patient_id OR get_my_role() = 'doctor');
-- Doktor posiela súhlas pacientovi
CREATE POLICY "patient_consents_insert" ON public.patient_consents
  FOR INSERT WITH CHECK (get_my_role() = 'doctor');
-- Pacient podpisuje / odmieta | doktor môže tiež editovať
CREATE POLICY "patient_consents_update" ON public.patient_consents
  FOR UPDATE USING (
    (get_my_role() = 'patient' AND auth.uid() = patient_id)
    OR get_my_role() = 'doctor'
  );
CREATE POLICY "patient_consents_delete" ON public.patient_consents
  FOR DELETE USING (get_my_role() = 'doctor');


-- ── PATIENT_NOTES (interné poznámky doktora — pacient nevidí!) ────────────────
ALTER TABLE public.patient_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_notes_select" ON public.patient_notes;
DROP POLICY IF EXISTS "patient_notes_insert" ON public.patient_notes;
DROP POLICY IF EXISTS "patient_notes_update" ON public.patient_notes;
DROP POLICY IF EXISTS "patient_notes_delete" ON public.patient_notes;

CREATE POLICY "patient_notes_select" ON public.patient_notes
  FOR SELECT USING (get_my_role() = 'doctor');
CREATE POLICY "patient_notes_insert" ON public.patient_notes
  FOR INSERT WITH CHECK (get_my_role() = 'doctor');
CREATE POLICY "patient_notes_update" ON public.patient_notes
  FOR UPDATE USING (get_my_role() = 'doctor');
CREATE POLICY "patient_notes_delete" ON public.patient_notes
  FOR DELETE USING (get_my_role() = 'doctor');


-- ── PATIENT_ATTACHMENTS ───────────────────────────────────────────────────────
ALTER TABLE public.patient_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_attachments_select" ON public.patient_attachments;
DROP POLICY IF EXISTS "patient_attachments_insert" ON public.patient_attachments;
DROP POLICY IF EXISTS "patient_attachments_delete" ON public.patient_attachments;

CREATE POLICY "patient_attachments_select" ON public.patient_attachments
  FOR SELECT USING (auth.uid() = patient_id OR get_my_role() = 'doctor');
CREATE POLICY "patient_attachments_insert" ON public.patient_attachments
  FOR INSERT WITH CHECK (get_my_role() = 'doctor');
CREATE POLICY "patient_attachments_delete" ON public.patient_attachments
  FOR DELETE USING (get_my_role() = 'doctor');


-- ── FAMILY_MEMBERS ────────────────────────────────────────────────────────────
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_members_select" ON public.family_members;
DROP POLICY IF EXISTS "family_members_insert" ON public.family_members;
DROP POLICY IF EXISTS "family_members_update" ON public.family_members;
DROP POLICY IF EXISTS "family_members_delete" ON public.family_members;

CREATE POLICY "family_members_select" ON public.family_members
  FOR SELECT USING (auth.uid() = patient_id OR get_my_role() = 'doctor');
CREATE POLICY "family_members_insert" ON public.family_members
  FOR INSERT WITH CHECK (auth.uid() = patient_id);
CREATE POLICY "family_members_update" ON public.family_members
  FOR UPDATE USING (auth.uid() = patient_id);
CREATE POLICY "family_members_delete" ON public.family_members
  FOR DELETE USING (auth.uid() = patient_id OR get_my_role() = 'doctor');


-- ── WAITING_LIST ──────────────────────────────────────────────────────────────
ALTER TABLE public.waiting_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waiting_list_select" ON public.waiting_list;
DROP POLICY IF EXISTS "waiting_list_insert" ON public.waiting_list;
DROP POLICY IF EXISTS "waiting_list_update" ON public.waiting_list;
DROP POLICY IF EXISTS "waiting_list_delete" ON public.waiting_list;

CREATE POLICY "waiting_list_select" ON public.waiting_list
  FOR SELECT USING (auth.uid() = patient_id OR get_my_role() = 'doctor');
CREATE POLICY "waiting_list_insert" ON public.waiting_list
  FOR INSERT WITH CHECK (auth.uid() = patient_id);
CREATE POLICY "waiting_list_update" ON public.waiting_list
  FOR UPDATE USING (
    (get_my_role() = 'patient' AND auth.uid() = patient_id)
    OR get_my_role() = 'doctor'
  );
CREATE POLICY "waiting_list_delete" ON public.waiting_list
  FOR DELETE USING (
    (get_my_role() = 'patient' AND auth.uid() = patient_id)
    OR get_my_role() = 'doctor'
  );


-- ── OPENING_HOURS (doktor nastavuje, všetci čítajú pre booking) ───────────────
ALTER TABLE public.opening_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opening_hours_select" ON public.opening_hours;
DROP POLICY IF EXISTS "opening_hours_insert" ON public.opening_hours;
DROP POLICY IF EXISTS "opening_hours_update" ON public.opening_hours;
DROP POLICY IF EXISTS "opening_hours_delete" ON public.opening_hours;

CREATE POLICY "opening_hours_select" ON public.opening_hours
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "opening_hours_insert" ON public.opening_hours
  FOR INSERT WITH CHECK (get_my_role() = 'doctor');
CREATE POLICY "opening_hours_update" ON public.opening_hours
  FOR UPDATE USING (get_my_role() = 'doctor');
CREATE POLICY "opening_hours_delete" ON public.opening_hours
  FOR DELETE USING (get_my_role() = 'doctor');


-- ── SERVICES (cenník — doktor spravuje, pacienti čítajú) ──────────────────────
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "services_select" ON public.services;
DROP POLICY IF EXISTS "services_insert" ON public.services;
DROP POLICY IF EXISTS "services_update" ON public.services;
DROP POLICY IF EXISTS "services_delete" ON public.services;

CREATE POLICY "services_select" ON public.services
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "services_insert" ON public.services
  FOR INSERT WITH CHECK (get_my_role() = 'doctor');
CREATE POLICY "services_update" ON public.services
  FOR UPDATE USING (get_my_role() = 'doctor');
CREATE POLICY "services_delete" ON public.services
  FOR DELETE USING (get_my_role() = 'doctor');


-- ── TIME_BLOCKS (blokácie doktora — pacienti čítajú pre kontrolu dostupnosti) ─
ALTER TABLE public.time_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "time_blocks_select" ON public.time_blocks;
DROP POLICY IF EXISTS "time_blocks_insert" ON public.time_blocks;
DROP POLICY IF EXISTS "time_blocks_update" ON public.time_blocks;
DROP POLICY IF EXISTS "time_blocks_delete" ON public.time_blocks;

CREATE POLICY "time_blocks_select" ON public.time_blocks
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "time_blocks_insert" ON public.time_blocks
  FOR INSERT WITH CHECK (get_my_role() = 'doctor');
CREATE POLICY "time_blocks_update" ON public.time_blocks
  FOR UPDATE USING (get_my_role() = 'doctor');
CREATE POLICY "time_blocks_delete" ON public.time_blocks
  FOR DELETE USING (get_my_role() = 'doctor');


-- ═══════════════════════════════════════════════════════════════════════════════
-- OVERENIE — Spusti po aplikovaní skriptu a skontroluj výstup
-- ═══════════════════════════════════════════════════════════════════════════════

-- Všetky tabuľky s RLS statusom
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Všetky aktívne politiky
SELECT
  tablename,
  policyname,
  cmd       AS operation,
  permissive,
  qual      AS using_expr,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
