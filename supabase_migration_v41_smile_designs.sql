-- ════════════════════════════════════════════════════════════════════════════
-- Smile Designs — AI-powered smile transformations
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS smile_designs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  original_url  text NOT NULL,
  result_url    text,
  effect_type   text NOT NULL CHECK (effect_type IN ('whitening','veneers','enhancement','alignment','braces')),
  intensity     integer DEFAULT 75 CHECK (intensity BETWEEN 0 AND 100),
  status        text DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Index for patient lookup
CREATE INDEX IF NOT EXISTS idx_smile_designs_patient ON smile_designs(patient_id, created_at DESC);

-- RLS
ALTER TABLE smile_designs ENABLE ROW LEVEL SECURITY;

-- Patient can see own designs
CREATE POLICY "Patients see own smile designs"
  ON smile_designs FOR SELECT
  USING (auth.uid() = patient_id);

-- Patient can create own designs
CREATE POLICY "Patients create own smile designs"
  ON smile_designs FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

-- Patient can delete own designs
CREATE POLICY "Patients delete own smile designs"
  ON smile_designs FOR DELETE
  USING (auth.uid() = patient_id);

-- Doctor can see all designs
CREATE POLICY "Doctors see all smile designs"
  ON smile_designs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('doctor','owner')
    )
  );

-- Storage bucket for smile design images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('smile-designs', 'smile-designs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Patients upload smile images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'smile-designs' AND auth.uid() IS NOT NULL);

CREATE POLICY "Public read smile images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'smile-designs');

CREATE POLICY "Patients delete own smile images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'smile-designs' AND auth.uid() IS NOT NULL);
