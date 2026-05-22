-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase_migration_v43_bugfixes.sql
-- Opravy chýbajúcich RLS policies nájdených počas bug auditu
--
-- Spustenie: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. waiting_list: chýba UPDATE policy ─────────────────────────────────────
-- Kód volá .update({ status: 'cancelled' }) na zrušenie z čakacej listiny
-- Bez tejto policy to v produkcii ticho zlyhá (RLS block)
DROP POLICY IF EXISTS "waiting_list_update" ON public.waiting_list;
CREATE POLICY "waiting_list_update" ON public.waiting_list FOR UPDATE
  USING (auth.uid() = patient_id OR get_my_role() = 'doctor' OR get_my_role() = 'reception');

-- ── Done ──────────────────────────────────────────────────────────────────────
