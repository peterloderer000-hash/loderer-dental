-- ============================================================
-- Loderer Dental App — Migrácia v2
-- Spusti v: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ─── 1. Profil: foto + špeciálnosť doktora ───────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS specialty  text;

-- ─── 2. Termíny: stav "pending" + hodnotenie ─────────────────
-- Pridaj pending do CHECK constraint (DROP + RE-ADD)
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
    CHECK (status IN ('pending','scheduled','completed','cancelled'));

-- Hodnotenie a recenzia pacienta
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_rating smallint CHECK (patient_rating >= 1 AND patient_rating <= 5),
  ADD COLUMN IF NOT EXISTS patient_review text;

-- ─── 3. Zubná karta: rozšírené statusy (24 stavov) ───────────
-- Odstráň starý CHECK, pridaj nový s plným zoznamom
ALTER TABLE public.dental_charts
  DROP CONSTRAINT IF EXISTS dental_charts_status_check;

ALTER TABLE public.dental_charts
  ADD CONSTRAINT dental_charts_status_check
    CHECK (status IN (
      'healthy',
      'cavity',        'early_cavity',  'watch',
      'filled',        'large_filling', 'replace_filling',
      'crown',         'bridge',        'implant',         'veneer',    'sealant',
      'root_canal',    'extracted',     'missing',
      'fracture',      'erosion',       'abrasion',
      'hypoplasia',    'hypomineralization',
      'periodontal',   'mobility',
      'improve_hygiene', 'treatment_needed'
    ));

-- ─── 4. Storage bucket "avatars" ─────────────────────────────
-- Vytvor bucket (ak neexistuje)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;

-- Politiky pre storage
DROP POLICY IF EXISTS "Avatars — public read"  ON storage.objects;
DROP POLICY IF EXISTS "Avatars — auth upload"  ON storage.objects;
DROP POLICY IF EXISTS "Avatars — owner update" ON storage.objects;
DROP POLICY IF EXISTS "Avatars — owner delete" ON storage.objects;

CREATE POLICY "Avatars — public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Avatars — auth upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Avatars — owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatars — owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ─── 5. Pacienti môžu aktualizovať vlastné hodnotenie ────────
DROP POLICY IF EXISTS "Patients can rate own appointment" ON public.appointments;
CREATE POLICY "Patients can rate own appointment"
  ON public.appointments FOR UPDATE
  USING  (patient_id = auth.uid())
  WITH CHECK (patient_id = auth.uid());

-- ─── 6. Overenie ─────────────────────────────────────────────
SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_name = 'profiles'
  AND  column_name IN ('avatar_url', 'specialty')
ORDER  BY column_name;

SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_name = 'appointments'
  AND  column_name IN ('patient_rating', 'patient_review', 'status')
ORDER  BY column_name;

SELECT constraint_name, check_clause
FROM   information_schema.check_constraints
WHERE  constraint_name IN (
  'appointments_status_check',
  'dental_charts_status_check'
);
-- ============================================================
-- HOTOVO — nové možnosti:
--  ✅ Profilové fotky (bucket avatars)
--  ✅ Špeciálnosť doktora (profiles.specialty)
--  ✅ Pending termíny (appointments.status = 'pending')
--  ✅ Hodnotenie pacientov (patient_rating 1-5)
--  ✅ 24 statusov zubnej karty
-- ============================================================
