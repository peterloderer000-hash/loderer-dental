-- ═══════════════════════════════════════════════════════════════════════════
-- Loderer Dental App — Migrácia v3
-- Spusti v: Supabase Dashboard → SQL Editor → New query → Run
--
-- Čo rieši:
--   1. Opravená atomická rezervácia — kontrola aj 'pending' termínov
--   2. Pacient môže zrušiť vlastný 'pending' termín (RLS politika)
--   3. Nový stĺpec custom_duration_minutes (ak ešte neexistuje)
--   4. Opravený notifikačný trigger — správne rozlišuje medzi
--      "doktor odmietol" vs "pacient odvolal" žiadosť
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. custom_duration_minutes (pre doktora pri schvalovaní) ────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS custom_duration_minutes integer;

-- ─── 2. Opravená funkcia book_appointment ────────────────────────────────────
--
-- Zmeny oproti v1:
--   • Kontrola kolízie zahŕňa aj 'pending' termíny
--   • Nový parameter p_status ('pending' pre pacientov, 'scheduled' pre doktora)
--   • Subquery na duration (namiesto JOIN) — kompatibilnejšie s RLS

CREATE OR REPLACE FUNCTION public.book_appointment(
  p_doctor_id        uuid,
  p_patient_id       uuid,
  p_service_id       uuid,
  p_start            timestamptz,
  p_duration_minutes integer,
  p_notes            text    DEFAULT NULL,
  p_status           text    DEFAULT 'pending'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end      timestamptz;
  v_conflict boolean;
  v_new_id   uuid;
BEGIN
  -- ─── Autorizácia ───────────────────────────────────────────────────────────
  -- Pacient môže rezervovať len pre seba; doktor môže pre kohokoľvek
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  IF auth.uid() != p_patient_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
    END IF;
  END IF;

  -- ─── Výpočet konca termínu ─────────────────────────────────────────────────
  v_end := p_start + (p_duration_minutes || ' minutes')::interval;

  -- ─── Kontrola kolízie — LOCK pre atomic ochranu ────────────────────────────
  -- Kontrolujeme SCHEDULED aj PENDING — oba blokujú slot
  SELECT EXISTS (
    SELECT 1
    FROM   appointments a
    WHERE  a.doctor_id  = p_doctor_id
      AND  a.status     IN ('scheduled', 'pending')
      AND  a.appointment_date < v_end
      AND  (
        a.appointment_date
        + (
            COALESCE(
              (SELECT duration_minutes FROM services WHERE id = a.service_id),
              30
            ) || ' minutes'
          )::interval
      ) > p_start
    FOR UPDATE OF a
  ) INTO v_conflict;

  IF v_conflict THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  -- ─── Vloženie termínu ──────────────────────────────────────────────────────
  INSERT INTO appointments (
    patient_id, doctor_id, service_id,
    appointment_date, status, notes
  )
  VALUES (
    p_patient_id, p_doctor_id, p_service_id,
    p_start, p_status, p_notes
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'id', v_new_id);
END;
$$;

-- ─── 3. Oprávnenia pre funkciu ────────────────────────────────────────────────
REVOKE ALL    ON FUNCTION public.book_appointment FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.book_appointment TO authenticated;

-- ─── 4. RLS politika — pacient môže zrušiť vlastný pending termín ────────────
-- Existujúca politika UPDATE musí zahŕňať zmenu statusu na 'cancelled'
-- pre stav 'pending' (nie len hodnotenie)

-- Zruš staré obmedzené politiky (ak existujú)
DROP POLICY IF EXISTS "Patients can rate own appointment"   ON public.appointments;
DROP POLICY IF EXISTS "Patients can update own appointment" ON public.appointments;

-- Nová, širšia politika pre pacienta (hodnotenie + zrušenie pending)
CREATE POLICY "Patients can update own appointment"
  ON public.appointments FOR UPDATE
  USING  (patient_id = auth.uid())
  WITH CHECK (patient_id = auth.uid());

-- ─── 5. Opravený notifikačný trigger ──────────────────────────────────────────
--
-- Problem: Keď pacient odvolá vlastnú 'pending' žiadosť, trigger
-- posielal pacientovi notifikáciu "Žiadosť zamietnutá" — ale to nie je pravda,
-- pacient sám žiadosť odvolal. Správne správanie:
--   • Pacient odvolá pending → upozorniť DOKTORA "Pacient odvolal žiadosť"
--   • Doktor zamietne pending → upozorniť PACIENTA "Žiadosť zamietnutá"
--
-- Rozlišujeme podľa auth.uid() — v triggers cez RLS sa uid() = volajúci.
-- (Pozn: trigger beží SECURITY DEFINER, ale auth.uid() číta JWT session.)

CREATE OR REPLACE FUNCTION fn_appointment_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_name  text;
  v_doctor_name   text;
  v_date_label    text;
  v_service_name  text;
  v_title         text;
  v_body          text;
  v_type          text;
  v_target        uuid;
  v_caller        uuid;
BEGIN
  -- Zisti volajúceho (pacient alebo doktor)
  v_caller := auth.uid();

  -- Získaj mená a čas
  SELECT full_name INTO v_patient_name FROM profiles WHERE id = NEW.patient_id;
  SELECT full_name INTO v_doctor_name  FROM profiles WHERE id = NEW.doctor_id;
  SELECT name      INTO v_service_name FROM services  WHERE id = NEW.service_id;
  v_date_label := to_char(
    NEW.appointment_date AT TIME ZONE 'Europe/Bratislava',
    'DD.MM.YYYY o HH24:MI'
  );

  -- ── INSERT: nový termín (pending) → upozorni doktora ──
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    v_title  := '📋 Nová žiadosť o termín';
    v_body   := COALESCE(v_patient_name, 'Pacient') || ' žiada o termín ' || v_date_label
                || CASE WHEN v_service_name IS NOT NULL THEN ' (' || v_service_name || ')' ELSE '' END || '.';
    v_type   := 'info';
    v_target := NEW.doctor_id;

    INSERT INTO notifications(user_id, title, body, type, appointment_id)
    VALUES (v_target, v_title, v_body, v_type, NEW.id);
    RETURN NEW;
  END IF;

  -- ── UPDATE: zmena stavu ──
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status

      -- Doktor schválil → upozorni pacienta
      WHEN 'scheduled' THEN
        v_title  := '✅ Termín potvrdený!';
        v_body   := 'Váš termín ' || v_date_label || ' bol potvrdený doktorom'
                    || CASE WHEN v_doctor_name IS NOT NULL THEN ' (' || v_doctor_name || ')' ELSE '' END || '.';
        v_type   := 'success';
        v_target := NEW.patient_id;

      -- Zrušenie — rozlíš podľa toho kto zrušil
      WHEN 'cancelled' THEN
        IF OLD.status = 'pending' THEN
          IF v_caller = NEW.patient_id THEN
            -- Pacient odvolal vlastnú žiadosť → upozorni doktora
            v_title  := 'ℹ️ Žiadosť odvolaná';
            v_body   := COALESCE(v_patient_name, 'Pacient') || ' odvolal žiadosť o termín ' || v_date_label || '.';
            v_type   := 'info';
            v_target := NEW.doctor_id;
          ELSE
            -- Doktor odmietol žiadosť → upozorni pacienta
            v_title  := '❌ Žiadosť zamietnutá';
            v_body   := 'Váš termín ' || v_date_label || ' nebol schválený. Rezervujte si iný termín.';
            v_type   := 'error';
            v_target := NEW.patient_id;
          END IF;
        ELSE
          -- Zrušenie potvrdeného termínu → upozorni pacienta
          v_title  := '🚫 Termín zrušený';
          v_body   := 'Termín ' || v_date_label || ' bol zrušený.';
          v_type   := 'warning';
          v_target := NEW.patient_id;
        END IF;

      -- Dokončenie → upozorni pacienta (požiadaj o hodnotenie)
      WHEN 'completed' THEN
        v_title  := '🦷 Návšteva dokončená';
        v_body   := 'Vaša návšteva bola úspešne dokončená. Ohodnoťte prosím vašu skúsenosť!';
        v_type   := 'success';
        v_target := NEW.patient_id;

      ELSE
        RETURN NEW;
    END CASE;

    INSERT INTO notifications(user_id, title, body, type, appointment_id)
    VALUES (v_target, v_title, v_body, v_type, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Znovu aplikuj trigger (funkcia bola opravená, trigger ostáva rovnaký)
DROP TRIGGER IF EXISTS trg_appointment_notifications ON appointments;
CREATE TRIGGER trg_appointment_notifications
  AFTER INSERT OR UPDATE OF status ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_appointment_notification();

-- ─── 6. Overenie ─────────────────────────────────────────────────────────────
SELECT proname, pronargs
FROM   pg_proc
WHERE  proname IN ('book_appointment', 'fn_appointment_notification');

SELECT column_name
FROM   information_schema.columns
WHERE  table_name = 'appointments'
  AND  column_name = 'custom_duration_minutes';

-- ═══════════════════════════════════════════════════════════════════════════
-- HOTOVO — nové možnosti v3:
--   ✅ Atomická rezervácia chráni aj pred duplicitnými 'pending' termínmi
--   ✅ Pacient môže zrušiť vlastný 'pending' (odvolať žiadosť)
--   ✅ custom_duration_minutes (doktor nastaví pri schválení)
--   ✅ Správne notifikácie: "pacient odvolal" vs "doktor zamietol"
-- ═══════════════════════════════════════════════════════════════════════════
