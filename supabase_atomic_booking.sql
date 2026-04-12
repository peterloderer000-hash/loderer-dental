-- ═══════════════════════════════════════════════════════════════════════════
-- Loderer Dental — Atomic booking RPC
-- Spusti v: Supabase Dashboard → SQL Editor → New query → Run
--
-- Táto funkcia nahrádza jednoduchý INSERT z klienta a
-- garantuje, že dva súčasné požiadavky nemôžu vytvoriť
-- prekrývajúce sa termíny pre rovnakého doktora.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Funkcia book_appointment ────────────────────────────────────────────
--
-- Vstup (JSON):
--   p_doctor_id       uuid      — ID doktora
--   p_patient_id      uuid      — ID pacienta
--   p_service_id      uuid      — ID výkonu (môže byť null)
--   p_start           timestamptz — začiatok termínu
--   p_duration_minutes integer   — dĺžka výkonu v minútach
--   p_notes           text      — poznámky pacienta (môže byť null)
--
-- Výstup (JSON):
--   { "ok": true,  "id": "<uuid>" }          — termín vytvorený
--   { "ok": false, "reason": "conflict" }    — kolízia s existujúcim termínom
--   { "ok": false, "reason": "unauthorized" }— volajúci nie je p_patient_id

CREATE OR REPLACE FUNCTION public.book_appointment(
  p_doctor_id        uuid,
  p_patient_id       uuid,
  p_service_id       uuid,
  p_start            timestamptz,
  p_duration_minutes integer,
  p_notes            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end         timestamptz;
  v_conflict    boolean;
  v_new_id      uuid;
BEGIN
  -- 1. Overenie: volajúci musí byť pacient alebo doktor
  IF auth.uid() != p_patient_id THEN
    -- Povolíme aj doktorom rezervovať pre pacienta
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
    END IF;
  END IF;

  -- 2. Vypočítaj koniec nového termínu
  v_end := p_start + (p_duration_minutes || ' minutes')::interval;

  -- 3. Skontroluj kolíziu — LOCK riadky doktora pre čas trvania transakcie
  SELECT EXISTS (
    SELECT 1
    FROM   appointments a
    JOIN   services     s ON s.id = a.service_id
    WHERE  a.doctor_id  = p_doctor_id
      AND  a.status     = 'scheduled'
      AND  a.appointment_date < v_end
      AND  (a.appointment_date + (COALESCE(s.duration_minutes, 30) || ' minutes')::interval) > p_start
    FOR UPDATE OF a
  ) INTO v_conflict;

  IF v_conflict THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  -- 4. Vlož termín
  INSERT INTO appointments (
    patient_id, doctor_id, service_id,
    appointment_date, status, notes
  )
  VALUES (
    p_patient_id, p_doctor_id, p_service_id,
    p_start, 'scheduled', p_notes
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'id', v_new_id);
END;
$$;

-- ─── 2. Oprávnenia ───────────────────────────────────────────────────────────
-- Funkcia beží pod bezpečnostným kontextom definera,
-- ale volajúci musí byť prihlásený (authenticated).
REVOKE ALL ON FUNCTION public.book_appointment FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.book_appointment TO authenticated;

-- ─── 3. Overenie ─────────────────────────────────────────────────────────────
-- Skontroluj že funkcia existuje:
SELECT proname, prosecdef
FROM   pg_proc
WHERE  proname = 'book_appointment';
