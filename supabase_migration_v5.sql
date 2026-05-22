-- ═══════════════════════════════════════════════════════════════════════════
-- Loderer Dental App — Migrácia v5
-- Spusti v: Supabase Dashboard → SQL Editor → New query → Run
--
-- Čo rieši:
--   1. Tabuľka patient_notes — interné poznámky doktora k pacientovi
--      (viditeľné LEN pre doktora, ktorý ich napísal)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.patient_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, patient_id)   -- jeden doktor = max 1 poznámka na pacienta (upsert)
);

-- Index pre rýchle vyhľadávanie
CREATE INDEX IF NOT EXISTS idx_patient_notes_doctor   ON public.patient_notes(doctor_id);
CREATE INDEX IF NOT EXISTS idx_patient_notes_patient  ON public.patient_notes(patient_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_patient_notes_updated_at ON public.patient_notes;
CREATE TRIGGER trg_patient_notes_updated_at
  BEFORE UPDATE ON public.patient_notes
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.patient_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor sees own notes"    ON public.patient_notes;
DROP POLICY IF EXISTS "Doctor manages own notes" ON public.patient_notes;

-- Doktor vidí a spravuje LEN svoje poznámky
CREATE POLICY "Doctor manages own notes"
  ON public.patient_notes FOR ALL
  TO authenticated
  USING  (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- ── Overenie ──────────────────────────────────────────────────────────────────
SELECT table_name, column_name
FROM   information_schema.columns
WHERE  table_name = 'patient_notes'
ORDER  BY ordinal_position;

-- ═══════════════════════════════════════════════════════════════════════════
-- HOTOVO:
--   ✅ patient_notes tabuľka s RLS — len doktor vidí vlastné poznámky
--   ✅ Unique constraint (doctor_id, patient_id) — upsert bezpečný
--   ✅ Auto-update updated_at trigger
-- ═══════════════════════════════════════════════════════════════════════════
