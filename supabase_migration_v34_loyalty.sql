-- Migration v34: Loyalty / Vernostný program
-- Run this in Supabase SQL Editor

-- Tabuľka bodov
CREATE TABLE IF NOT EXISTS public.loyalty_points (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points      INT  NOT NULL DEFAULT 0,
  reason      TEXT NOT NULL,          -- 'appointment', 'review', 'referral', 'streak', 'bonus'
  description TEXT,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Index pre rýchle súčty
CREATE INDEX IF NOT EXISTS idx_loyalty_patient ON public.loyalty_points(patient_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_created ON public.loyalty_points(created_at DESC);

-- RLS
ALTER TABLE public.loyalty_points ENABLE ROW LEVEL SECURITY;

-- Pacienti vidia len svoje body
DROP POLICY IF EXISTS "loyalty_select" ON public.loyalty_points;
CREATE POLICY "loyalty_select" ON public.loyalty_points
  FOR SELECT USING (
    auth.uid() = patient_id
    OR get_my_role() = 'doctor'
  );

-- Len doktor/systém môže pridávať body
DROP POLICY IF EXISTS "loyalty_insert" ON public.loyalty_points;
CREATE POLICY "loyalty_insert" ON public.loyalty_points
  FOR INSERT WITH CHECK (
    get_my_role() = 'doctor'
    OR get_my_role() = 'patient'
  );

-- Pridaj stĺpec loyalty_tier do profiles (Bronze, Silver, Gold, Platinum)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS loyalty_tier TEXT DEFAULT 'bronze';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS loyalty_total_points INT DEFAULT 0;
