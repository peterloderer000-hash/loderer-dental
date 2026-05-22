-- ─── Fáza 17: Blokovanie ordinačného času ────────────────────────────────────
-- Tabuľka pre doktorove blokované časy (obed, dovolenka, schôdzka, …)

CREATE TABLE IF NOT EXISTS time_blocks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL DEFAULT 'Blokovaný čas',
  block_type  TEXT        NOT NULL DEFAULT 'other'
              CHECK (block_type IN ('lunch', 'meeting', 'vacation', 'personal', 'other')),
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  CHECK (end_time > start_time)
);

ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;

-- Doktor spravuje vlastné blokovania
CREATE POLICY "Doctor manages own time blocks"
  ON time_blocks
  USING  (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- Pacienti môžu čítať blokovania (potrebné pri výbere termínu)
CREATE POLICY "Anyone can read time blocks"
  ON time_blocks FOR SELECT
  USING (true);

-- Indexy pre rýchle vyhľadávanie podľa doktora a dátumu
CREATE INDEX IF NOT EXISTS time_blocks_doctor_time_idx
  ON time_blocks (doctor_id, start_time, end_time);
