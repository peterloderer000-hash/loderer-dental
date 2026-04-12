-- ============================================================
-- Loderer Dental — Ordinačné hodiny
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS public.opening_hours (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week  integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Pon, 7=Ned
  open_time    time,        -- napr. '08:00'
  close_time   time,        -- napr. '17:00'
  is_closed    boolean NOT NULL DEFAULT false,
  note         text,        -- napr. "Obedná prestávka 12:00–13:00"
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (doctor_id, day_of_week)
);

ALTER TABLE public.opening_hours ENABLE ROW LEVEL SECURITY;

-- Čítať môže ktokoľvek (pacienti)
DROP POLICY IF EXISTS "Opening hours readable by all" ON public.opening_hours;
CREATE POLICY "Opening hours readable by all"
  ON public.opening_hours FOR SELECT USING (true);

-- Zapisovať môže iba sám doktor
DROP POLICY IF EXISTS "Doctors manage own hours" ON public.opening_hours;
CREATE POLICY "Doctors manage own hours"
  ON public.opening_hours FOR ALL
  USING (auth.uid() = doctor_id)
  WITH CHECK (auth.uid() = doctor_id);

-- Predvolené hodiny pre existujúcich doktorov (Pon–Pia 8:00–17:00, Sob+Ned zatvorené)
INSERT INTO public.opening_hours (doctor_id, day_of_week, open_time, close_time, is_closed)
SELECT
  p.id,
  d.day,
  CASE WHEN d.day <= 5 THEN '08:00'::time ELSE NULL END,
  CASE WHEN d.day <= 5 THEN '17:00'::time ELSE NULL END,
  CASE WHEN d.day >= 6 THEN true ELSE false END
FROM public.profiles p
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6),(7)) AS d(day)
WHERE p.role = 'doctor'
ON CONFLICT (doctor_id, day_of_week) DO NOTHING;

-- Overenie
SELECT day_of_week, open_time, close_time, is_closed
FROM public.opening_hours
ORDER BY day_of_week;
