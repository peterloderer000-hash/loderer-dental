-- ════════════════════════════════════════════════════════════════════════
-- Migration v36 — Multi-clinic: clinics + clinic_members
-- ════════════════════════════════════════════════════════════════════════
-- PREREQUISITE: v35 (get_my_role funkcia) musi byt spustena skor
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Clinics table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinics (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  address    TEXT,
  phone      TEXT,
  email      TEXT,
  owner_id   UUID        REFERENCES auth.users(id),
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_manages_clinics" ON public.clinics;
CREATE POLICY "owner_manages_clinics" ON public.clinics
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid() OR public.get_my_role() = 'owner')
  WITH CHECK (owner_id = auth.uid() OR public.get_my_role() = 'owner');

DROP POLICY IF EXISTS "staff_reads_clinics" ON public.clinics;
CREATE POLICY "staff_reads_clinics" ON public.clinics
  FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('doctor','reception','hygienist','owner','patient'));

-- ── 2. Vloz defaultnu kliniku (ak este neexistuje) ───────────────────────
INSERT INTO public.clinics (name, address, phone)
VALUES ('Loderer Dental', 'Zadaj adresu kliniky', '+421 000 000 000')
ON CONFLICT DO NOTHING;

-- ── 3. Clinic members table (doctor <-> clinic) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.clinic_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'doctor'
             CHECK (role IN ('doctor','reception','hygienist','owner')),
  specialty  TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (clinic_id, user_id)
);

CREATE INDEX IF NOT EXISTS clinic_members_clinic_idx ON public.clinic_members (clinic_id, is_active);
CREATE INDEX IF NOT EXISTS clinic_members_user_idx   ON public.clinic_members (user_id);

ALTER TABLE public.clinic_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_reads_clinic_members" ON public.clinic_members;
CREATE POLICY "staff_reads_clinic_members" ON public.clinic_members
  FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('doctor','reception','hygienist','owner','patient'));

DROP POLICY IF EXISTS "owner_manages_clinic_members" ON public.clinic_members;
CREATE POLICY "owner_manages_clinic_members" ON public.clinic_members
  FOR ALL TO authenticated
  USING  (public.get_my_role() IN ('owner','doctor'))
  WITH CHECK (public.get_my_role() IN ('owner','doctor'));

-- ── 4. Pridaj clinic_id do existujucich tabuliek ──────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_clinic_id UUID REFERENCES public.clinics(id);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id);

-- ── 5. Backfill: nastav clinic_id na defaultnu kliniku ────────────────────
UPDATE public.appointments
SET clinic_id = (SELECT id FROM public.clinics LIMIT 1)
WHERE clinic_id IS NULL;

UPDATE public.profiles
SET default_clinic_id = (SELECT id FROM public.clinics LIMIT 1)
WHERE default_clinic_id IS NULL AND role IN ('doctor','reception','hygienist','owner');

-- ── 6. Pridaj clinic_id FK do invitations (z v35) ────────────────────────
ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_clinic_id_fkey;

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_clinic_id_fkey
  FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;

-- ── 7. Backfill clinic_members z existujucich doctorov ───────────────────
INSERT INTO public.clinic_members (clinic_id, user_id, role)
SELECT
  (SELECT id FROM public.clinics LIMIT 1),
  p.id,
  p.role
FROM public.profiles p
WHERE p.role IN ('doctor','reception','hygienist','owner')
ON CONFLICT (clinic_id, user_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════
-- Verifikacia:
-- SELECT id, name FROM public.clinics;
-- SELECT cm.user_id, p.full_name, cm.role, cm.specialty
-- FROM public.clinic_members cm JOIN public.profiles p ON p.id = cm.user_id;
-- ════════════════════════════════════════════════════════════════════════
