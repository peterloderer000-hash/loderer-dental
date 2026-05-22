-- ============================================================
-- NOTIFIKAČNÉ TRIGGERY — spusti v Supabase SQL Editore
-- ============================================================

-- 1. Tabuľka notifikácií (ak ešte neexistuje)
CREATE TABLE IF NOT EXISTS notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title          text NOT NULL,
  body           text,
  type           text NOT NULL DEFAULT 'info'
                   CHECK (type IN ('info','success','warning','error')),
  read           boolean NOT NULL DEFAULT false,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Index pre rýchle vyhľadávanie podľa user_id
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own notifications" ON notifications;
CREATE POLICY "Users see own notifications" ON notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 2. Funkcia — auto-notifikácia pri zmene stavu termínu
-- ============================================================
CREATE OR REPLACE FUNCTION fn_appointment_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_name  text;
  v_doctor_name   text;
  v_date_label    text;
  v_service_name  text;
  v_title         text;
  v_body          text;
  v_type          text;
  v_target        uuid;
BEGIN
  -- Získaj mená a čas
  SELECT full_name INTO v_patient_name FROM profiles WHERE id = NEW.patient_id;
  SELECT full_name INTO v_doctor_name  FROM profiles WHERE id = NEW.doctor_id;
  SELECT name      INTO v_service_name FROM services  WHERE id = NEW.service_id;
  v_date_label := to_char(
    NEW.appointment_date AT TIME ZONE 'Europe/Bratislava',
    'DD.MM.YYYY o HH24:MI'
  );

  -- ── INSERT: nový termín (pending) → upozorni doktora ──
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    v_title  := '📋 Nová žiadosť o termín';
    v_body   := COALESCE(v_patient_name, 'Pacient') || ' žiada o termín ' || v_date_label
                || CASE WHEN v_service_name IS NOT NULL THEN ' (' || v_service_name || ')' ELSE '' END || '.';
    v_type   := 'info';
    v_target := NEW.doctor_id;

    INSERT INTO notifications(user_id, title, body, type, appointment_id)
    VALUES (v_target, v_title, v_body, v_type, NEW.id);
    RETURN NEW;
  END IF;

  -- ── UPDATE: zmena stavu ──
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status

      -- Doktor schválil → upozorni pacienta
      WHEN 'scheduled' THEN
        v_title  := '✅ Termín potvrdený!';
        v_body   := 'Váš termín ' || v_date_label || ' bol potvrdený doktorom'
                    || CASE WHEN v_doctor_name IS NOT NULL THEN ' (' || v_doctor_name || ')' ELSE '' END || '.';
        v_type   := 'success';
        v_target := NEW.patient_id;

      -- Zrušenie
      WHEN 'cancelled' THEN
        IF OLD.status = 'pending' THEN
          -- Doktor odmietol žiadosť
          v_title  := '❌ Žiadosť zamietnutá';
          v_body   := 'Váš termín ' || v_date_label || ' nebol schválený. Rezervujte si iný termín.';
          v_type   := 'error';
          v_target := NEW.patient_id;
        ELSE
          -- Zrušenie potvrdeného termínu
          v_title  := '🚫 Termín zrušený';
          v_body   := 'Termín ' || v_date_label || ' bol zrušený.';
          v_type   := 'warning';
          v_target := NEW.patient_id;
        END IF;

      -- Dokončenie → upozorni pacienta (požiadaj o hodnotenie)
      WHEN 'completed' THEN
        v_title  := '🦷 Návšteva dokončená';
        v_body   := 'Vaša návšteva bola úspešne dokončená. Ohodnoťte prosím vašu skúsenosť!';
        v_type   := 'success';
        v_target := NEW.patient_id;

      ELSE
        RETURN NEW;
    END CASE;

    INSERT INTO notifications(user_id, title, body, type, appointment_id)
    VALUES (v_target, v_title, v_body, v_type, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. Trigger
-- ============================================================
DROP TRIGGER IF EXISTS trg_appointment_notifications ON appointments;
CREATE TRIGGER trg_appointment_notifications
  AFTER INSERT OR UPDATE OF status ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_appointment_notification();

-- ============================================================
-- HOTOVO — notifikácie sa teraz vytvárajú automaticky:
--   pacient rezervuje  → doktor dostane info
--   doktor schváli     → pacient dostane success
--   doktor zamietne    → pacient dostane error
--   termín zrušený     → pacient dostane warning
--   termín dokončený   → pacient dostane success + výzva na hodnotenie
-- ============================================================
