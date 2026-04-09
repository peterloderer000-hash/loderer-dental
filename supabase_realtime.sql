-- ============================================================
-- Supabase Realtime – povolenie pre tabuľky
-- Spusti tento skript v Supabase SQL Editore
-- (Dashboard → SQL Editor → New query → Run)
-- ============================================================

-- 1. REPLICA IDENTITY FULL – Realtime dostane celý obsah riadku
--    (nielen PK), bez toho DELETE eventy neprenášajú dáta
ALTER TABLE public.appointments REPLICA IDENTITY FULL;
ALTER TABLE public.profiles     REPLICA IDENTITY FULL;

-- 2. Pridaj tabuľky do Realtime publikácie
--    (ak tabuľky už sú, ALTER ... ADD TABLE bezpečne skončí bez chyby)
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- 3. Overenie – malo by vrátiť oba záznamy
SELECT schemaname, tablename
FROM   pg_publication_tables
WHERE  pubname = 'supabase_realtime'
  AND  tablename IN ('appointments', 'profiles');
