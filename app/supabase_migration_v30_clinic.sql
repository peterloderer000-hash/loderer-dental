-- ─── Migration v30: Clinic Operations Module ─────────────────────────────────
-- Spusti v Supabase Dashboard → SQL Editor
-- Idempotentné (bezpečné spustiť viackrát)

-- ─── 1. Rozšírenie tabuľky appointments ──────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS clinic_status      TEXT DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS chair_start_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS treatment_end_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS room_id            UUID;

-- CHECK constraint na clinic_status (pridaj samostatne, ignoruj ak existuje)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'appointments'
      AND constraint_name = 'appointments_clinic_status_check'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_clinic_status_check
      CHECK (clinic_status IN (
        'scheduled','arrived','waiting','in_chair',
        'treatment_done','checkout','paid',
        'late','cancelled','no_show'
      ));
  END IF;
END$$;

-- Backfill: nastav clinic_status pre existujúce záznamy podľa hlavného status
UPDATE appointments SET clinic_status = 'cancelled'
  WHERE clinic_status = 'scheduled' AND status = 'cancelled';
UPDATE appointments SET clinic_status = 'paid'
  WHERE clinic_status = 'scheduled' AND status = 'completed';
UPDATE appointments SET clinic_status = 'arrived'
  WHERE clinic_status = 'scheduled' AND status = 'arrived';

-- ─── 2. Tabuľka clinic_rooms ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_rooms (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#6B4F35',
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pridaj FK z appointments na clinic_rooms (ak ešte nie je)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'appointments'
      AND constraint_name = 'appointments_room_id_fkey'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_room_id_fkey
      FOREIGN KEY (room_id) REFERENCES clinic_rooms(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ─── 3. Tabuľka clinic_events ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID        NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  doctor_id      UUID        NOT NULL REFERENCES profiles(id),
  event_type     TEXT        NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Indexy ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clinic_events_appointment
  ON clinic_events(appointment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appts_clinic_status_doctor
  ON appointments(doctor_id, clinic_status, appointment_date)
  WHERE clinic_status NOT IN ('paid','cancelled','no_show');

CREATE INDEX IF NOT EXISTS idx_clinic_rooms_doctor
  ON clinic_rooms(doctor_id, sort_order);

-- ─── 5. RLS — clinic_rooms ────────────────────────────────────────────────────
ALTER TABLE clinic_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_rooms_doctor_all" ON clinic_rooms;
CREATE POLICY "clinic_rooms_doctor_all" ON clinic_rooms
  FOR ALL USING (get_my_role() = 'doctor');

-- ─── 6. RLS — clinic_events ───────────────────────────────────────────────────
ALTER TABLE clinic_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_events_doctor_all" ON clinic_events;
CREATE POLICY "clinic_events_doctor_all" ON clinic_events
  FOR ALL USING (get_my_role() = 'doctor');

-- ─── 7. Seed: predvolené miestnosti (nepovinné, spusti manuálne ak chceš) ─────
-- INSERT INTO clinic_rooms (doctor_id, name, color, sort_order)
-- SELECT id, 'Kreslo 1', '#6B4F35', 1 FROM profiles WHERE role = 'doctor' LIMIT 1;
-- INSERT INTO clinic_rooms (doctor_id, name, color, sort_order)
-- SELECT id, 'Kreslo 2', '#1A5276', 2 FROM profiles WHERE role = 'doctor' LIMIT 1;

-- ─── Overenie ─────────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'appointments'
  AND column_name IN ('clinic_status','chair_start_at','treatment_end_at','room_id')
ORDER BY column_name;
