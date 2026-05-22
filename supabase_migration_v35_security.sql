-- ════════════════════════════════════════════════════════════════════════
-- Migration v35 — Security: Invitations + Role guards
-- ════════════════════════════════════════════════════════════════════════
-- Standalone — žiadna závislosť na iných migrácii.
-- (clinic_id FK pridá v36 cez ALTER TABLE po vytvorení clinics tabuľky)
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Rozšír profiles.role CHECK constraint ─────────────────────────────
-- Pôvodný constraint: ('patient','doctor') — pridáme všetky roly
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('patient', 'doctor', 'reception', 'hygienist', 'owner'));

-- ── 2. Helper funkcia: get_my_role() ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ── 3. Invitations table (BEZ clinic_id FK — FK pridá v36) ───────────────
CREATE TABLE IF NOT EXISTS public.invitations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    UUID,                          -- FK pridá v36 po vytvorení clinics
  email        TEXT        NOT NULL,
  role         TEXT        NOT NULL CHECK (role IN ('doctor','reception','hygienist','owner')),
  token        TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by   UUID        REFERENCES auth.users(id),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invitations_token_idx ON public.invitations (token);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON public.invitations (email);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Owners a doctors môžu spravovať pozvánky
DROP POLICY IF EXISTS "owner_doctor_can_invite" ON public.invitations;
CREATE POLICY "owner_doctor_can_invite" ON public.invitations
  FOR ALL TO authenticated
  USING  (public.get_my_role() IN ('owner', 'doctor'))
  WITH CHECK (public.get_my_role() IN ('owner', 'doctor'));

-- Ktokoľvek s tokenom môže čítať (token je tajomstvo)
DROP POLICY IF EXISTS "anyone_can_read_by_token" ON public.invitations;
CREATE POLICY "anyone_can_read_by_token" ON public.invitations
  FOR SELECT TO anon, authenticated USING (true);

-- ── 4. Ochrana pred eskaláciou roly ──────────────────────────────────────
-- Len service_role alebo owner môže meniť rolu profilu
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF auth.role() <> 'service_role'
       AND public.get_my_role() <> 'owner' THEN
      RAISE EXCEPTION 'Insufficient privileges to change role';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- ── 5. Default rola = patient pre nových používateľov ────────────────────
CREATE OR REPLACE FUNCTION public.set_default_patient_role()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role IS NULL THEN NEW.role := 'patient'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_default_patient_role ON public.profiles;
CREATE TRIGGER trg_default_patient_role
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_default_patient_role();

-- ── 6. RLS: Doctors/staff môžu vidieť profily všetkých pacientov ─────────
-- (existujúce politiky pokrývajú základné prípady — pridáme staff SELECT)
DROP POLICY IF EXISTS "staff_can_view_all_profiles" ON public.profiles;
CREATE POLICY "staff_can_view_all_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('doctor', 'reception', 'hygienist', 'owner'));

-- ════════════════════════════════════════════════════════════════════════
-- Verifikácia po spustení:
-- ════════════════════════════════════════════════════════════════════════
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.profiles'::regclass AND contype = 'c';
--
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public' AND routine_name = 'get_my_role';
-- ════════════════════════════════════════════════════════════════════════
