-- Migration v28: Opravy a vylepšenia
-- Spusti v Supabase SQL Editor (bezpečné aj opakovane)

-- ─── 1) updated_at stĺpec pre treatment_plans ────────────────────────────────
ALTER TABLE treatment_plans
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ─── 2) updated_at stĺpec pre treatment_plan_items ───────────────────────────
ALTER TABLE treatment_plan_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ─── 3) family_member_name pre reservácie za rodinných príslušníkov ──────────
--  Umožňuje doktorovi vidieť, pre koho je termín rezervovaný
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS family_member_name TEXT;

-- ─── 4) Overenie ──────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'treatment_plans'
ORDER BY ordinal_position;
