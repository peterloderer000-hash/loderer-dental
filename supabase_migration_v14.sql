-- ============================================================
-- Migration v14: Clinic profile fields on doctor profiles
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS clinic_name    TEXT,
  ADD COLUMN IF NOT EXISTS clinic_address TEXT,
  ADD COLUMN IF NOT EXISTS clinic_ico     TEXT,
  ADD COLUMN IF NOT EXISTS clinic_dic     TEXT;
