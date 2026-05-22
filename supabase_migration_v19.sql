-- Migration v19: Prílohy k pacientovi (patient_attachments)
-- Spusti v Supabase SQL Editor

CREATE TABLE IF NOT EXISTS patient_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doctor_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  file_type   TEXT NOT NULL DEFAULT 'image',   -- 'image' | 'pdf' | 'other'
  category    TEXT NOT NULL DEFAULT 'general', -- 'xray' | 'photo' | 'document' | 'general'
  notes       TEXT,
  size_bytes  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_attachments_patient_idx
  ON patient_attachments (patient_id, created_at DESC);

ALTER TABLE patient_attachments ENABLE ROW LEVEL SECURITY;

-- Doktor: plný prístup
DROP POLICY IF EXISTS "Doctor manages attachments" ON patient_attachments;
CREATE POLICY "Doctor manages attachments"
  ON patient_attachments FOR ALL
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor'));

-- Pacient: vidí len vlastné
DROP POLICY IF EXISTS "Patient views own attachments" ON patient_attachments;
CREATE POLICY "Patient views own attachments"
  ON patient_attachments FOR SELECT
  USING (auth.uid() = patient_id);

-- ─── Storage bucket + politiky ───────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-attachments',
  'patient-attachments',
  true,
  52428800,   -- 50 MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public            = true,
  file_size_limit   = 52428800,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf'];

-- Doktor môže nahrávať
DROP POLICY IF EXISTS "Doctors upload attachments" ON storage.objects;
CREATE POLICY "Doctors upload attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'patient-attachments'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'doctor')
  );

-- Doktor môže mazať
DROP POLICY IF EXISTS "Doctors delete attachments" ON storage.objects;
CREATE POLICY "Doctors delete attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'patient-attachments'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'doctor')
  );

-- Všetci prihlásení môžu čítať (verejný bucket, ale len prihlásení)
DROP POLICY IF EXISTS "Authenticated read attachments" ON storage.objects;
CREATE POLICY "Authenticated read attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'patient-attachments');
