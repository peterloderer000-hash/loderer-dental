-- ─── Notifikačný systém ───────────────────────────────────────────────────────

-- 1. Tabuľka
CREATE TABLE IF NOT EXISTS notifications (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title          text NOT NULL,
  body           text,
  type           text DEFAULT 'info' CHECK (type IN ('info','success','warning','error')),
  read           boolean DEFAULT false,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now()
);

-- 2. Index pre rýchle vyhľadávanie
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at DESC);

-- 3. RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own notifications"    ON notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;

CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- INSERT povoliť cez SECURITY DEFINER trigger (service role ho volá)
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- 4. Trigger funkcia: automatické notifikácie pri zmenách termínov
CREATE OR REPLACE FUNCTION notify_on_appointment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_patient_name text;
  v_service_name text;
  v_appt_time    text;
BEGIN
  SELECT full_name INTO v_patient_name FROM profiles WHERE id = NEW.patient_id;
  SELECT name     INTO v_service_name FROM services  WHERE id = NEW.service_id;
  v_appt_time := to_char(
    NEW.appointment_date AT TIME ZONE 'Europe/Bratislava',
    'DD.MM.YYYY o HH24:MI'
  );

  -- ── Nový termín (INSERT) ────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- Doktor: nová rezervácia
    INSERT INTO notifications (user_id, title, body, type, appointment_id)
    VALUES (
      NEW.doctor_id,
      'Nová rezervácia 📅',
      COALESCE(v_patient_name, 'Pacient') || ' — ' || v_appt_time
        || COALESCE(' (' || v_service_name || ')', ''),
      'info',
      NEW.id
    );
    -- Pacient: potvrdenie
    INSERT INTO notifications (user_id, title, body, type, appointment_id)
    VALUES (
      NEW.patient_id,
      'Termín rezervovaný ✓',
      v_appt_time || COALESCE(' · ' || v_service_name, ''),
      'success',
      NEW.id
    );
    RETURN NEW;
  END IF;

  -- ── Zmena statusu (UPDATE) ──────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN

    -- Zrušený → notifikuj obe strany
    IF NEW.status = 'cancelled' THEN
      INSERT INTO notifications (user_id, title, body, type, appointment_id)
      VALUES (
        NEW.patient_id,
        'Termín bol zrušený',
        v_appt_time || COALESCE(' · ' || v_service_name, '')
          || ' — kontaktujte nás pre nový termín',
        'warning',
        NEW.id
      );
      INSERT INTO notifications (user_id, title, body, type, appointment_id)
      VALUES (
        NEW.doctor_id,
        'Termín bol zrušený',
        COALESCE(v_patient_name, 'Pacient') || ' — ' || v_appt_time,
        'warning',
        NEW.id
      );
    END IF;

    -- Dokončený → notifikuj pacienta
    IF NEW.status = 'completed' THEN
      INSERT INTO notifications (user_id, title, body, type, appointment_id)
      VALUES (
        NEW.patient_id,
        'Ošetrenie dokončené ✓',
        v_appt_time || COALESCE(' · ' || v_service_name, '')
          || CASE WHEN NEW.doctor_notes IS NOT NULL
                  THEN ' — k dispozícii záver doktora'
                  ELSE '' END,
        'success',
        NEW.id
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- 5. Trigger
DROP TRIGGER IF EXISTS appointment_notifications ON appointments;
CREATE TRIGGER appointment_notifications
  AFTER INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION notify_on_appointment_change();

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
