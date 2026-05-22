-- ============================================================
-- Migration v31 — Multi-clinic + Multi-doctor foundation
-- ============================================================
-- Run this BEFORE v30 (v30 invitations table references clinics)
-- ============================================================

-- ── Clinics table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  address       TEXT,
  city          TEXT,
  phone         TEXT,
  email         TEXT,
  ico           TEXT,
  dic           TEXT,
  logo_url      TEXT,
  primary_color TEXT DEFAULT '#3D1008',
  timezone      TEXT DEFAULT 'Europe/Bratislava',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Default clinic
INSERT INTO public.clinics (name, slug, address, city, phone)
VALUES ('Loderer Dental', 'loderer-bratislava',
        'Adresa kliniky', 'Bratislava', '+421 000 000 000')
ON CONFLICT (slug) DO NOTHING;

-- ── Clinic members (many-to-many) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinic_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner','doctor','reception','hygienist')),
  specialty   TEXT,
  bio         TEXT,
  is_active   BOOLEAN DEFAULT true,
  joined_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (clinic_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS clinic_members_clinic_idx ON public.clinic_members (clinic_id);
CREATE INDEX IF NOT EXISTS clinic_members_user_idx   ON public.clinic_members (user_id);

-- ── Add clinic_id to existing tables ────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_clinic_id UUID REFERENCES public.clinics(id);

-- Backfill existing appointments with default clinic
UPDATE public.appointments
SET clinic_id = (SELECT id FROM public.clinics WHERE slug = 'loderer-bratislava' LIMIT 1)
WHERE clinic_id IS NULL;

-- Backfill existing staff profiles with default clinic
UPDATE public.profiles
SET default_clinic_id = (SELECT id FROM public.clinics WHERE slug = 'loderer-bratislava' LIMIT 1)
WHERE role IN ('doctor','reception','hygienist','owner')
  AND default_clinic_id IS NULL;

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.clinics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_read_clinics"    ON public.clinics;
CREATE POLICY "anyone_read_clinics" ON public.clinics
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "owner_manage_clinic"    ON public.clinics;
CREATE POLICY "owner_manage_clinic" ON public.clinics
  FOR ALL TO authenticated
  USING  (public.get_my_role() = 'owner')
  WITH CHECK (public.get_my_role() = 'owner');

DROP POLICY IF EXISTS "members_read_their_clinic" ON public.clinic_members;
CREATE POLICY "members_read_their_clinic" ON public.clinic_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_my_role() IN ('owner', 'doctor')
  );

DROP POLICY IF EXISTS "owner_manage_members" ON public.clinic_members;
CREATE POLICY "owner_manage_members" ON public.clinic_members
  FOR ALL TO authenticated
  USING  (public.get_my_role() IN ('owner', 'doctor'))
  WITH CHECK (public.get_my_role() IN ('owner', 'doctor'));
