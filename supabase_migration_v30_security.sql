-- ============================================================
-- Migration v30 — Security: Invitations + Role escalation guard
-- ============================================================
-- PREREQUISITE: Run supabase_migration_v31_multi_clinic.sql FIRST
--   (creates the `clinics` table referenced by invitations.clinic_id)
--   If you want to run v30 standalone, temporarily comment out the
--   clinic_id FK line and add it later via ALTER TABLE.
-- ============================================================

-- ── Helper: get current user's role ─────────────────────────
-- Safe to re-run (CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ── Invitations table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('doctor','reception','hygienist','owner')),
  token        TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by   UUID REFERENCES auth.users(id),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invitations_token_idx ON public.invitations (token);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON public.invitations (email);

-- ── Block role escalation ────────────────────────────────────
-- Only service_role or owner can change a profile's role
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

-- ── Default role for new signups = patient ───────────────────
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

-- ── RLS for invitations ──────────────────────────────────────
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Owners and doctors can create/manage invitations
DROP POLICY IF EXISTS "owner_doctor_can_invite" ON public.invitations;
CREATE POLICY "owner_doctor_can_invite" ON public.invitations
  FOR ALL TO authenticated
  USING  (public.get_my_role() IN ('owner', 'doctor'))
  WITH CHECK (public.get_my_role() IN ('owner', 'doctor'));

-- Anyone with the token can read it (token is the secret)
DROP POLICY IF EXISTS "anyone_can_read_by_token" ON public.invitations;
CREATE POLICY "anyone_can_read_by_token" ON public.invitations
  FOR SELECT TO anon, authenticated USING (true);
