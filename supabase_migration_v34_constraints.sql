-- ════════════════════════════════════════════════════════════════════════
-- Migration v34 — Oprava CHECK constraint pre waiting_list.status
-- ════════════════════════════════════════════════════════════════════════
-- Problém: Aplikácia používa statusy 'approved', 'dismissed', 'contacted',
--          'cancelled' — žiadny z existujúcich constraintov nepokrýva všetky.
--   v10 constraint: waiting, contacted, booked, cancelled
--   v17 constraint: waiting, approved, dismissed
--   waitlist.tsx:   uses 'approved', 'dismissed'
--   patients.tsx:   uses 'contacted'
--   appointments.tsx: uses 'cancelled'
-- ════════════════════════════════════════════════════════════════════════

-- 1. Drop všetky existujúce waiting_list status constrainty
ALTER TABLE public.waiting_list
  DROP CONSTRAINT IF EXISTS waiting_list_status_check;

ALTER TABLE public.waiting_list
  DROP CONSTRAINT IF EXISTS waiting_list_status_check1;

-- Zisti mená constraintov ak inak pomenované:
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'public.waiting_list'::regclass AND contype = 'c';

-- 2. Recreate s kompletným zoznamom statusov
ALTER TABLE public.waiting_list
  ADD CONSTRAINT waiting_list_status_check
  CHECK (status IN (
    'waiting',    -- nový záznam, čaká na kontakt
    'contacted',  -- recepcia kontaktovala pacienta
    'booked',     -- pacient bol zaknihovaný (termín vytvorený)
    'approved',   -- doktor schválil
    'dismissed',  -- doktor odmietol / vymazal
    'cancelled'   -- pacient zrušil
  ));

-- ════════════════════════════════════════════════════════════════════════
-- Verifikácia
-- ════════════════════════════════════════════════════════════════════════
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.waiting_list'::regclass AND contype = 'c';
-- ════════════════════════════════════════════════════════════════════════
