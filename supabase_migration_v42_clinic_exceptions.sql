-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase_migration_v42_clinic_exceptions.sql
-- Výnimky v ordinačných hodinách (sviatky, dovolenka, mimoriadne hodiny)
--
-- Spustenie: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Tabuľka clinic_exceptions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinic_exceptions (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID    REFERENCES public.profiles(id) ON DELETE CASCADE,
  date        DATE    NOT NULL,
  is_closed   BOOLEAN NOT NULL DEFAULT true,
  open_time   TEXT,         -- napr. '09:00' (ak is_closed = false)
  close_time  TEXT,         -- napr. '13:00'
  note        TEXT,         -- napr. 'Sviatok – Deň práce'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, date)
);

-- ── 2. Index ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clinic_exceptions_doctor_date
  ON public.clinic_exceptions (doctor_id, date);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.clinic_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exceptions_staff_all" ON public.clinic_exceptions;
CREATE POLICY "exceptions_staff_all" ON public.clinic_exceptions
  FOR ALL USING (
    public.get_my_role() IN ('doctor', 'hygienist', 'owner', 'reception')
  );

-- ── Done ──────────────────────────────────────────────────────────────────────
