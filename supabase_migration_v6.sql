-- ═══════════════════════════════════════════════════════════════════════════
-- Loderer Dental App — Migrácia v6
-- Spusti v: Supabase Dashboard → SQL Editor → New query → Run
--
-- Čo rieši:
--   1. Stĺpec photo_url v tabuľke dental_charts
--   2. Storage bucket "tooth-photos" (verejný)
--   3. Storage politiky pre bucket
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Pridaj photo_url do dental_charts ───────────────────────────────────
ALTER TABLE public.dental_charts
  ADD COLUMN IF NOT EXISTS photo_url text;

-- ─── 2. Storage bucket tooth-photos ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tooth-photos',
  'tooth-photos',
  true,
  5242880,           -- 5 MB limit
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. Storage RLS politiky ────────────────────────────────────────────────
-- Verejné čítanie (fotky sú v ambulancii, pacient ich vidí vo svojej karte)
DROP POLICY IF EXISTS "Tooth photos public read"   ON storage.objects;
DROP POLICY IF EXISTS "Tooth photos doctor upload" ON storage.objects;
DROP POLICY IF EXISTS "Tooth photos doctor delete" ON storage.objects;

CREATE POLICY "Tooth photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tooth-photos');

-- Doktor môže nahrať/prepísať do priečinka pacienta
CREATE POLICY "Tooth photos doctor upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'tooth-photos'
    AND public.is_doctor()
  );

CREATE POLICY "Tooth photos doctor update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'tooth-photos'
    AND public.is_doctor()
  );

CREATE POLICY "Tooth photos doctor delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'tooth-photos'
    AND public.is_doctor()
  );

-- ─── 4. Overenie ─────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_name = 'dental_charts' AND column_name = 'photo_url';

SELECT id, name, public FROM storage.buckets WHERE id = 'tooth-photos';

-- ═══════════════════════════════════════════════════════════════════════════
-- HOTOVO:
--   ✅ dental_charts.photo_url — uloží URL fotky k zubu
--   ✅ bucket tooth-photos — verejný, limit 5 MB, len JPEG/PNG/WebP
--   ✅ RLS — len doktor môže nahrávať, každý môže čítať
-- ═══════════════════════════════════════════════════════════════════════════
