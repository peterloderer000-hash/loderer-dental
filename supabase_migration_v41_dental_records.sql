-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase_migration_v41_dental_records.sql
-- História zmien stavu zuba (dental chart history)
--
-- Spustenie: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Tabuľka dental_records ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dental_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doctor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tooth_number INT NOT NULL CHECK (tooth_number BETWEEN 1 AND 48),
  status       TEXT NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Index pre rýchle dotazy ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dental_records_patient_tooth
  ON public.dental_records (patient_id, tooth_number, created_at DESC);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.dental_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dental_records_staff_all"    ON public.dental_records;
DROP POLICY IF EXISTS "dental_records_patient_read" ON public.dental_records;

CREATE POLICY "dental_records_staff_all" ON public.dental_records
  FOR ALL USING (
    public.get_my_role() IN ('doctor', 'hygienist', 'owner', 'reception')
  );

CREATE POLICY "dental_records_patient_read" ON public.dental_records
  FOR SELECT USING (patient_id = auth.uid());

-- ── Done ──────────────────────────────────────────────────────────────────────
