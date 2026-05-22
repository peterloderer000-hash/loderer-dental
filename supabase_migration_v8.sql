-- ═══════════════════════════════════════════════════════════════════════════
-- Loderer Dental App — Migrácia v8
-- Rozšírenie anamnézy o kritické zdravotné údaje
-- Supabase Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Pridaj nové stĺpce do health_passports
ALTER TABLE public.health_passports
  ADD COLUMN IF NOT EXISTS blood_type              text,
  ADD COLUMN IF NOT EXISTS insurance_provider      text,
  ADD COLUMN IF NOT EXISTS insurance_number        text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS is_pregnant             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_dental_visit       date;

-- 2. Overenie
SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_name = 'health_passports'
  AND  column_name IN (
    'blood_type', 'insurance_provider', 'insurance_number',
    'emergency_contact_name', 'emergency_contact_phone', 'is_pregnant',
    'last_dental_visit'
  )
ORDER BY column_name;

-- ═══════════════════════════════════════════════════════════════════════════
-- HOTOVO:
--   ✅ blood_type              — Krvná skupina (A+, A-, B+, B-, AB+, AB-, O+, O-)
--   ✅ insurance_provider      — Zdravotná poisťovňa (VšZP, Dôvera, Union, Iné)
--   ✅ insurance_number        — Číslo poistenca
--   ✅ emergency_contact_name  — Kontaktná osoba v prípade núdze
--   ✅ emergency_contact_phone — Telefón núdzového kontaktu
--   ✅ is_pregnant             — Tehotenstvo (boolean)
--   ✅ last_dental_visit       — Dátum poslednej návštevy u zubára
-- ═══════════════════════════════════════════════════════════════════════════
