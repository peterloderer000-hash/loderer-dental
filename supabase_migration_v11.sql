-- ═══════════════════════════════════════════════════════════════════════════
-- Loderer Dental App — Migrácia v11
-- Automatické označenie čakacej listiny + notifikácie pacienta
-- Spusti v: Supabase Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Trigger: pri novom termíne → auto-zaknihuj čakaciu listinu pacienta ──
CREATE OR REPLACE FUNCTION fn_auto_book_waiting_list()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ak sa vkladá termín pre pacienta, označ jeho čakacie listiny ako "booked"
  IF TG_OP = 'INSERT' AND NEW.status IN ('scheduled', 'pending') THEN
    UPDATE public.waiting_list
    SET    status = 'booked'
    WHERE  patient_id = NEW.patient_id
      AND  status     = 'waiting';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_book_waiting_list ON public.appointments;
CREATE TRIGGER trg_auto_book_waiting_list
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_book_waiting_list();

-- ─── 2. Trigger: notifikácia pacientovi pri zmene stavu čakacej listiny ──────
CREATE OR REPLACE FUNCTION fn_waiting_list_status_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_name text;
  v_title        text;
  v_body         text;
BEGIN
  -- Len pri zmene statusu
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT name INTO v_service_name FROM services WHERE id = NEW.service_id;

  IF NEW.status = 'contacted' THEN
    v_title := '📞 Váš zubár vás kontaktoval';
    v_body  := 'Volali sme vám ohľadom vašej žiadosti na čakacej listine'
               || CASE WHEN v_service_name IS NOT NULL THEN ' (' || v_service_name || ')' ELSE '' END
               || '. Prosím, skontrolujte vaše správy.';

  ELSIF NEW.status = 'booked' THEN
    v_title := '✅ Termín zarezervovaný!';
    v_body  := 'Váš zápis na čakacej listine'
               || CASE WHEN v_service_name IS NOT NULL THEN ' (' || v_service_name || ')' ELSE '' END
               || ' bol prevedený na termín. Skontrolujte si vaše termíny.';

  ELSIF NEW.status = 'cancelled' THEN
    v_title := '❌ Čakacia listina zrušená';
    v_body  := 'Váš zápis na čakacej listine bol zrušený'
               || CASE WHEN v_service_name IS NOT NULL THEN ' (' || v_service_name || ')' ELSE '' END
               || '.';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO notifications(user_id, title, body, type)
  VALUES (NEW.patient_id, v_title, v_body, 'info');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_waiting_list_status_notification ON public.waiting_list;
CREATE TRIGGER trg_waiting_list_status_notification
  AFTER UPDATE ON public.waiting_list
  FOR EACH ROW
  EXECUTE FUNCTION fn_waiting_list_status_notification();

-- ─── 3. Trigger: notifikácia pacientovi pri schválení/zamietnutí termínu ─────
CREATE OR REPLACE FUNCTION fn_appointment_status_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_name text;
  v_doctor_name  text;
  v_title        text;
  v_body         text;
  v_appt_date    text;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT name INTO v_service_name FROM services  WHERE id  = NEW.service_id;
  SELECT full_name INTO v_doctor_name FROM profiles WHERE id = NEW.doctor_id;

  v_appt_date := to_char(NEW.appointment_date AT TIME ZONE 'Europe/Bratislava',
                         'DD.MM.YYYY o HH24:MI');

  IF NEW.status = 'scheduled' AND OLD.status = 'pending' THEN
    v_title := '✅ Termín schválený!';
    v_body  := 'Váš termín'
               || CASE WHEN v_service_name IS NOT NULL THEN ' (' || v_service_name || ')' ELSE '' END
               || ' bol schválený na ' || v_appt_date || '.';

  ELSIF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'scheduled') THEN
    v_title := '❌ Termín zrušený';
    v_body  := 'Váš termín'
               || CASE WHEN v_service_name IS NOT NULL THEN ' (' || v_service_name || ')' ELSE '' END
               || ' naplánovaný na ' || v_appt_date || ' bol zrušený.';

  ELSIF NEW.status = 'completed' AND OLD.status = 'scheduled' THEN
    v_title := '🦷 Návšteva dokončená';
    v_body  := 'Ďakujeme za vašu návštevu'
               || CASE WHEN v_doctor_name IS NOT NULL THEN ' u ' || v_doctor_name ELSE '' END
               || '. Ohodnoťte nás v aplikácii!';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO notifications(user_id, title, body, type)
  VALUES (NEW.patient_id, v_title, v_body, 'info');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_status_notification ON public.appointments;
CREATE TRIGGER trg_appointment_status_notification
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_appointment_status_notification();

-- ─── Overenie ─────────────────────────────────────────────────────────────────
SELECT trigger_name, event_object_table, event_manipulation
FROM   information_schema.triggers
WHERE  trigger_schema = 'public'
  AND  trigger_name IN (
    'trg_auto_book_waiting_list',
    'trg_waiting_list_status_notification',
    'trg_appointment_status_notification'
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- HOTOVO:
--   ✅ trg_auto_book_waiting_list — pri novom termíne auto-zaknihuje čakaciu listinu
--   ✅ trg_waiting_list_status_notification — notifikácia pacienta pri zmene statusu čakacej listiny
--   ✅ trg_appointment_status_notification — notifikácia pacienta pri schválení/zamietnutí/dokončení
-- ═══════════════════════════════════════════════════════════════════════════
