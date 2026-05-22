-- Migration v17: Čakacia listina (waiting_list)
-- Spusti v Supabase SQL Editor

CREATE TABLE IF NOT EXISTS waiting_list (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_id    UUID REFERENCES services(id) ON DELETE SET NULL,
  preferred_date DATE,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'approved', 'dismissed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pre rýchle načítanie čakajúcich
CREATE INDEX IF NOT EXISTS waiting_list_status_idx ON waiting_list (status, created_at DESC)
  WHERE status = 'waiting';

-- RLS
ALTER TABLE waiting_list ENABLE ROW LEVEL SECURITY;

-- Pacient: vidí a spravuje len vlastné záznamy
CREATE POLICY IF NOT EXISTS "Patient manages own waitlist"
  ON waiting_list FOR ALL
  USING  (auth.uid() = patient_id)
  WITH CHECK (auth.uid() = patient_id);

-- Doktor: číta všetky čakajúce záznamy a môže meniť status
CREATE POLICY IF NOT EXISTS "Doctor reads all waiting list"
  ON waiting_list FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'doctor'
    )
  );

CREATE POLICY IF NOT EXISTS "Doctor updates waiting list status"
  ON waiting_list FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'doctor'
    )
  );
