-- Migration v23: Push token + send-notification helper
-- Spusti v Supabase SQL Editor

-- 1) Pridaj push_token stĺpec do profiles (ak ešte neexistuje)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT;

-- 2) Tabuľka na ukladanie notifikácií od doktora k pacientovi
--    (už existuje cez useNotifications hook — len overíme štruktúru)
--    Ak notifications tabuľka NEEXISTUJE, vytvor ju:
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  body           TEXT,
  type           TEXT NOT NULL DEFAULT 'info'
                 CHECK (type IN ('info','success','warning','error')),
  read           BOOLEAN NOT NULL DEFAULT false,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User reads own notifications" ON notifications;
CREATE POLICY "User reads own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User updates own notifications" ON notifications;
CREATE POLICY "User updates own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Doctor inserts notifications" ON notifications;
CREATE POLICY "Doctor inserts notifications"
  ON notifications FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor')
  );
