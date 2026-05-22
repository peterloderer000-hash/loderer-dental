-- ════════════════════════════════════════════════════════════════════════
-- Migration v33 — Rozšírenie appointments_status_check constraint
-- ════════════════════════════════════════════════════════════════════════
-- Problém: Pacient kliká "Prišiel som" → app updatuje status='arrived'
--          ale DB to odmietne lebo CHECK constraint neobsahuje 'arrived'.
--
-- Riešenie: Drop & recreate constraint so VŠETKÝMI statusmi ktoré
--          aplikácia reálne používa.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Drop existing constraint
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

-- 2. Recreate s kompletným zoznamom statusov
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN (
    'pending',      -- žiadosť o termín, čaká na schválenie doktorom
    'scheduled',    -- potvrdený termín
    'arrived',      -- pacient sa nahlásil v čakárni (NOVÉ)
    'in_progress',  -- doktor začal ošetrenie
    'completed',    -- ošetrenie hotové
    'cancelled',    -- zrušené (pacientom alebo doktorom)
    'no_show'       -- pacient sa nedostavil
  ));

-- 3. Pridaj 'arrived_at' stĺpec ak neexistuje (z useAppointments.ts payload)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

-- 4. Index pre rýchle vyhľadávanie pacientov v čakárni
CREATE INDEX IF NOT EXISTS idx_appointments_arrived
  ON public.appointments (doctor_id, status, arrived_at)
  WHERE status = 'arrived';

-- ════════════════════════════════════════════════════════════════════════
-- Verifikácia: spusti tento SELECT po migrácii
-- ════════════════════════════════════════════════════════════════════════
-- SELECT con.conname, pg_get_constraintdef(con.oid)
-- FROM pg_constraint con
-- JOIN pg_class rel ON rel.oid = con.conrelid
-- WHERE rel.relname = 'appointments' AND con.conname = 'appointments_status_check';
-- ════════════════════════════════════════════════════════════════════════
