-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase_migration_v43_waitlist_notify.sql
-- Automatické notifikácie pre čakaciu listinu pri zrušení termínu
--
-- Spustenie: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_waitlist_on_cancel()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_service_name TEXT;
BEGIN
  -- Spusti len keď sa status zmení na 'cancelled'
  IF OLD.status = NEW.status OR NEW.status != 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Meno služby pre text správy
  SELECT name INTO v_service_name FROM services WHERE id = NEW.service_id;

  -- Pošli notifikáciu prvým 3 pacientom na čakacej listine
  -- (pre rovnakú alebo ľubovoľnú službu, zoradení podľa created_at)
  INSERT INTO notifications (user_id, title, body, type, appointment_id)
  SELECT
    wl.patient_id,
    '🦷 Uvoľnil sa termín!',
    COALESCE(
      'Uvoľnil sa termín pre ' || v_service_name || '. Kontaktujte nás alebo si rezervujte nový termín.',
      'Uvoľnil sa termín v ambulancii. Kontaktujte nás prosím.'
    ),
    'info',
    NEW.id
  FROM waiting_list wl
  WHERE wl.status = 'waiting'
    AND (wl.service_id = NEW.service_id OR wl.service_id IS NULL)
  ORDER BY wl.created_at ASC
  LIMIT 3;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_waitlist_cancel ON public.appointments;
CREATE TRIGGER trg_notify_waitlist_cancel
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_waitlist_on_cancel();

-- ── Done ──────────────────────────────────────────────────────────────────────
