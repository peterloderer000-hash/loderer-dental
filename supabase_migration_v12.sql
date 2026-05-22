-- ============================================================
-- Migration v12: Time blocks (doctor can block time in calendar)
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Tabuľka time_blocks
CREATE TABLE IF NOT EXISTS time_blocks (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  block_date   DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 2. Index pre rýchle dopytovanie podľa doktora a dátumu
CREATE INDEX IF NOT EXISTS idx_time_blocks_doctor_date
  ON time_blocks(doctor_id, block_date);

-- 3. RLS
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;

-- Doktor môže spravovať vlastné bloky
CREATE POLICY "Doctor manages own time blocks" ON time_blocks
  FOR ALL
  USING (auth.uid() = doctor_id)
  WITH CHECK (auth.uid() = doctor_id);

-- Pacienti môžu čítať bloky (pre kontrolu dostupnosti pri rezervácii)
CREATE POLICY "Patients can read time blocks" ON time_blocks
  FOR SELECT
  USING (true);
