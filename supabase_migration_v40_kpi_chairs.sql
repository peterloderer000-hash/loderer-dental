-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase_migration_v40_kpi_chairs.sql
-- Phase 1: KPI & Analytics — check-in timestamps + stoličky
--
-- Čo pridáva:
--   1. appointments: arrived_at, started_at, ended_at, chair_id
--   2. chairs tabuľka (Kreslo A / B / C)
--   3. RLS políky pre chairs
--   4. Indexy pre rýchle KPI dotazy
--   5. Pohľad (view) kpi_daily pre denný prehľad
--
-- Spustenie: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Stoličky (chairs) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chairs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,          -- 'Kreslo A', 'Kreslo B', 'Kreslo C'
  color      text NOT NULL DEFAULT '#6B4F3A',
  is_active  boolean NOT NULL DEFAULT true,
  sort_order int  NOT NULL DEFAULT 0
);

-- Ak tabuľka chairs už existovala bez sort_order / is_active, pridáme ich:
ALTER TABLE public.chairs
  ADD COLUMN IF NOT EXISTS is_active  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order int     NOT NULL DEFAULT 0;

-- Základné stoličky (vloží len ak tabuľka bola prázdna)
INSERT INTO public.chairs (name, color, sort_order) VALUES
  ('Kreslo A', '#6B4F3A', 1),
  ('Kreslo B', '#C4A882', 2),
  ('Kreslo C', '#2C7A4B', 3)
ON CONFLICT DO NOTHING;

-- ── 2. KPI stĺpce v appointments ─────────────────────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS arrived_at  timestamptz,
  ADD COLUMN IF NOT EXISTS started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at    timestamptz,
  ADD COLUMN IF NOT EXISTS chair_id    uuid REFERENCES public.chairs(id) ON DELETE SET NULL;

-- ── 3. Indexy pre rýchle dotazy ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appt_arrived_at ON public.appointments (arrived_at);
CREATE INDEX IF NOT EXISTS idx_appt_started_at ON public.appointments (started_at);
CREATE INDEX IF NOT EXISTS idx_appt_ended_at   ON public.appointments (ended_at);
CREATE INDEX IF NOT EXISTS idx_appt_chair       ON public.appointments (chair_id);
CREATE INDEX IF NOT EXISTS idx_appt_date        ON public.appointments (appointment_date);

-- ── 4. RLS pre chairs ─────────────────────────────────────────────────────────
ALTER TABLE public.chairs ENABLE ROW LEVEL SECURITY;

-- Všetci prihlásení môžu čítať stoličky
DROP POLICY IF EXISTS "chairs_select" ON public.chairs;
CREATE POLICY "chairs_select" ON public.chairs
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Len owner/reception môže meniť stoličky
DROP POLICY IF EXISTS "chairs_insert" ON public.chairs;
CREATE POLICY "chairs_insert" ON public.chairs
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('owner', 'reception')
  );

DROP POLICY IF EXISTS "chairs_update" ON public.chairs;
CREATE POLICY "chairs_update" ON public.chairs
  FOR UPDATE USING (
    public.get_my_role() IN ('owner', 'reception')
  );

-- ── 5. RLS — doktor/recepcia môžu updatovať KPI stĺpce ──────────────────────
-- (appointments tabuľka už má vlastné políky — len pridáme update pre KPI)
-- Predpokladáme existujúcu políku appointments_update, ktorá dovoľuje doktorovi
-- updatovať vlastné termíny. Ak neexistuje, vytvorí sa:

DROP POLICY IF EXISTS "appointments_update_staff" ON public.appointments;
CREATE POLICY "appointments_update_staff" ON public.appointments
  FOR UPDATE USING (
    public.get_my_role() IN ('doctor', 'reception', 'hygienist', 'owner')
  );

-- ── 6. View: kpi_daily (denný prehľad) ───────────────────────────────────────
CREATE OR REPLACE VIEW public.kpi_daily AS
SELECT
  date_trunc('day', a.appointment_date)          AS day,
  COUNT(*)                                        AS total_appointments,
  COUNT(*) FILTER (WHERE a.status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE a.status = 'cancelled') AS cancelled,
  COUNT(*) FILTER (WHERE a.status = 'no_show')   AS no_shows,
  COUNT(*) FILTER (WHERE a.arrived_at IS NOT NULL) AS arrived_count,

  -- Priemerná čakacia doba (arrived → started), v minútach
  ROUND(
    AVG(
      EXTRACT(EPOCH FROM (a.started_at - a.arrived_at)) / 60
    ) FILTER (WHERE a.started_at IS NOT NULL AND a.arrived_at IS NOT NULL)
  )::int AS avg_wait_minutes,

  -- Priemerná dĺžka ošetrenia (started → ended), v minútach
  ROUND(
    AVG(
      EXTRACT(EPOCH FROM (a.ended_at - a.started_at)) / 60
    ) FILTER (WHERE a.ended_at IS NOT NULL AND a.started_at IS NOT NULL)
  )::int AS avg_treatment_minutes,

  -- Celkový revenue za deň
  COALESCE(SUM(p.amount_cents) FILTER (WHERE p.status = 'paid'), 0) / 100.0 AS daily_revenue

FROM public.appointments a
LEFT JOIN public.payments p ON p.appointment_id = a.id
GROUP BY 1
ORDER BY 1 DESC;

-- Všetci staff môžu čítať KPI view
DROP POLICY IF EXISTS "kpi_daily_select" ON public.kpi_daily;
-- (views nededia RLS z tabuliek — prístup cez SELECT políku nie je potrebný
--  keď view je SECURITY INVOKER — základné správanie)

-- ── 7. Funkcia: get_today_kpi() ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_today_kpi()
RETURNS TABLE (
  total_appointments  bigint,
  completed           bigint,
  cancelled           bigint,
  no_shows            bigint,
  arrived_count       bigint,
  avg_wait_minutes    int,
  avg_treatment_minutes int,
  daily_revenue       numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    total_appointments,
    completed,
    cancelled,
    no_shows,
    arrived_count,
    avg_wait_minutes,
    avg_treatment_minutes,
    daily_revenue
  FROM kpi_daily
  WHERE day = date_trunc('day', now())
  LIMIT 1;
$$;

-- ── 8. View: appointment_kpi (per-day-per-chair — pre stats.tsx) ─────────────
-- Táto view má rovnakú štruktúru akú stats.tsx čaká:
--   avg_wait_minutes, avg_treatment_minutes, room_id (= chair_id), total, day
CREATE OR REPLACE VIEW public.appointment_kpi AS
SELECT
  date_trunc('day', a.appointment_date)::date       AS day,
  a.chair_id                                         AS room_id,
  COUNT(*)                                           AS total,
  ROUND(
    AVG(
      EXTRACT(EPOCH FROM (a.started_at - a.arrived_at)) / 60
    ) FILTER (WHERE a.started_at IS NOT NULL AND a.arrived_at IS NOT NULL)
  )::int                                             AS avg_wait_minutes,
  ROUND(
    AVG(
      EXTRACT(EPOCH FROM (a.ended_at - a.started_at)) / 60
    ) FILTER (WHERE a.ended_at IS NOT NULL AND a.started_at IS NOT NULL)
  )::int                                             AS avg_treatment_minutes
FROM public.appointments a
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- ── 9. Overenie ───────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'appointments'
  AND column_name IN ('arrived_at','started_at','ended_at','chair_id')
ORDER BY column_name;
