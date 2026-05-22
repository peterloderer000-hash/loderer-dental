-- ══════════════════════════════════════════════════════════════════════════════
-- AUTOMATICKÉ PRIPOMIENKY TERMÍNOV — pg_cron
-- Spusti JEDENKRÁT v Supabase SQL Editor
--
-- Čo robí:
--   Každých 30 minút skontroluje naplánované termíny a pošle in-app
--   notifikáciu pacientovi:
--     • 24 hodín pred termínom   → "Zajtra máš termín"
--     • 1 hodinu pred termínom   → "O hodinu máš termín"
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1) Povolenie pg_cron rozšírenia ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── 2) Funkcia: odošle notifikácie ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION send_appointment_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  appt RECORD;
  svc_name TEXT;
  notif_title TEXT;
  notif_body  TEXT;
BEGIN
  -- Prechádza termíny naplánované v okne:
  --   24h okno: appointment_date medzi (now+23h) a (now+25h)
  --    1h okno: appointment_date medzi (now+50min) a (now+70min)

  FOR appt IN
    SELECT
      a.id,
      a.patient_id,
      a.appointment_date,
      s.name AS service_name,
      s.emoji AS service_emoji,
      CASE
        WHEN a.appointment_date BETWEEN (now() + INTERVAL '23 hours') AND (now() + INTERVAL '25 hours') THEN '24h'
        WHEN a.appointment_date BETWEEN (now() + INTERVAL '50 minutes') AND (now() + INTERVAL '70 minutes') THEN '1h'
      END AS window_type
    FROM appointments a
    LEFT JOIN services s ON s.id = a.service_id
    WHERE
      a.status = 'scheduled'
      AND (
        a.appointment_date BETWEEN (now() + INTERVAL '23 hours') AND (now() + INTERVAL '25 hours')
        OR
        a.appointment_date BETWEEN (now() + INTERVAL '50 minutes') AND (now() + INTERVAL '70 minutes')
      )
  LOOP
    -- Skontroluj, či sme tú notifikáciu ešte neposlali (dedup podľa appointment_id + body)
    svc_name := COALESCE(appt.service_emoji || ' ' || appt.service_name, '🦷 Zubný termín');

    IF appt.window_type = '24h' THEN
      notif_title := '📅 Zajtra máš termín';
      notif_body  := 'Pripomíname: zajtra o ' ||
                     TO_CHAR(appt.appointment_date AT TIME ZONE 'Europe/Bratislava', 'HH24:MI') ||
                     ' — ' || svc_name ||
                     '. Tešíme sa na teba! 🦷';
    ELSE
      notif_title := '⏰ O hodinu máš termín';
      notif_body  := 'O hodinu ťa čakáme na ' || svc_name ||
                     ' (o ' ||
                     TO_CHAR(appt.appointment_date AT TIME ZONE 'Europe/Bratislava', 'HH24:MI') ||
                     '). Doraziť načas :)';
    END IF;

    -- Vlož notifikáciu len ak ešte neexistuje rovnaká pre tento termín
    INSERT INTO notifications (user_id, title, body, type, appointment_id)
    SELECT
      appt.patient_id,
      notif_title,
      notif_body,
      'info',
      appt.id
    WHERE NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.appointment_id = appt.id
        AND n.title = notif_title
        AND n.created_at > now() - INTERVAL '2 hours'
    );

  END LOOP;
END;
$$;

-- ─── 3) Zaplánuj cron job (každých 30 minút) ──────────────────────────────────
-- Najprv zmaž starý job ak existuje
SELECT cron.unschedule('appointment-reminders') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'appointment-reminders'
);

SELECT cron.schedule(
  'appointment-reminders',          -- názov jobu
  '*/30 * * * *',                   -- každých 30 minút
  'SELECT send_appointment_reminders();'
);

-- ─── 4) Overenie ──────────────────────────────────────────────────────────────
SELECT jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'appointment-reminders';

-- ══════════════════════════════════════════════════════════════════════════════
-- POZNÁMKY:
-- • pg_cron musí byť povolený v Supabase: Dashboard → Database → Extensions
-- • Ak pg_cron nie je dostupný, funkciu môžeš zavolať ručne:
--     SELECT send_appointment_reminders();
-- • Časy sú v UTC — termíny sú uložené v UTC, zobrazujú sa v Europe/Bratislava
-- • Notifikácie sa zobrazia v appke v sekcii "Notifikácie" (zvonček)
-- ══════════════════════════════════════════════════════════════════════════════
