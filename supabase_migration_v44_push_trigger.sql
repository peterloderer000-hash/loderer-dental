-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase_migration_v44_push_trigger.sql
-- DB trigger: INSERT do notifications → zavolá Edge Function send-push
--
-- PRED SPUSTENÍM:
-- 1. Získaj Service Role Key: Supabase Dashboard → Settings → API → service_role
-- 2. Spusti tento príkaz (nahraď YOUR_SERVICE_ROLE_KEY):
--      ALTER DATABASE postgres
--        SET app.supabase_service_role_key = 'YOUR_SERVICE_ROLE_KEY';
-- 3. Deploy Edge Function:
--      supabase functions deploy send-push --project-ref fcxkgnfnfswcusjetqop
-- 4. Set edge function secret:
--      supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY \
--        --project-ref fcxkgnfnfswcusjetqop
-- 5. Potom spusti tento SQL súbor v Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Povoliť pg_net rozšírenie ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- ── 2. Trigger funkcia ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_service_key TEXT;
  v_edge_url    TEXT := 'https://fcxkgnfnfswcusjetqop.supabase.co/functions/v1/send-push';
BEGIN
  -- Načítaj service role key z DB nastavení (pozri PRED SPUSTENÍM vyššie)
  BEGIN
    v_service_key := current_setting('app.supabase_service_role_key');
  EXCEPTION WHEN OTHERS THEN
    -- Ak nastavenie neexistuje, preskočí push (nebude crashovať insert)
    RAISE WARNING '[push_trigger] app.supabase_service_role_key nie je nastavený — push preskočený';
    RETURN NEW;
  END;

  IF v_service_key IS NULL OR v_service_key = '' THEN
    RETURN NEW;
  END IF;

  -- Asynchrónne POST na Edge Function (neblokuje INSERT do notifications)
  PERFORM extensions.http_post(
    url     := v_edge_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := row_to_json(NEW)::jsonb
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nikdy nespadni kvôli push — notifikácia sa uloží aj bez push
  RAISE WARNING '[push_trigger] HTTP post zlyhal: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ── 3. Trigger na notifications INSERT ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_push_on_notification ON public.notifications;
CREATE TRIGGER trg_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_on_notification();

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Otestuj:
--   INSERT INTO notifications (user_id, title, body, type)
--   VALUES ('<tvoj_user_id>', 'Test push', 'Ahoj zo Supabase!', 'info');
-- Telefón by mal dostať notifikáciu do ~2 sekúnd.
