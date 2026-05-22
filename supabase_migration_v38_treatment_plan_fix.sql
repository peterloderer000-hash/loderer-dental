-- ============================================================
-- Migration v38: treatment_plan_fix
-- Adds visible_to_patient flag, computed totals, and
-- appointment status-change notification trigger
-- ============================================================

-- ── 1. treatment_plans: add visible_to_patient column ────────
ALTER TABLE treatment_plans
  ADD COLUMN IF NOT EXISTS visible_to_patient BOOLEAN NOT NULL DEFAULT false;

-- Index for patient-side filter
CREATE INDEX IF NOT EXISTS idx_treatment_plans_visible
  ON treatment_plans (patient_id, visible_to_patient);

-- ── 2. treatment_plans: add updated_at column ────────────────
ALTER TABLE treatment_plans
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── 3. treatment_plan_items: add updated_at column ───────────
ALTER TABLE treatment_plan_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── 4. Auto-compute total_cost on treatment_plans ────────────
-- (denormalised column for fast reads)
ALTER TABLE treatment_plans
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(10,2) DEFAULT 0;

CREATE OR REPLACE FUNCTION update_treatment_plan_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE treatment_plans
  SET total_cost = (
    SELECT COALESCE(SUM(estimated_cost), 0)
    FROM   treatment_plan_items
    WHERE  plan_id = COALESCE(NEW.plan_id, OLD.plan_id)
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.plan_id, OLD.plan_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_plan_total ON treatment_plan_items;
CREATE TRIGGER trg_update_plan_total
  AFTER INSERT OR UPDATE OR DELETE ON treatment_plan_items
  FOR EACH ROW EXECUTE FUNCTION update_treatment_plan_total();

-- ── 5. Appointment status-change notification trigger ─────────
-- Inserts a row into `notifications` whenever an appointment
-- moves to scheduled, completed, or cancelled.
CREATE OR REPLACE FUNCTION notify_on_appointment_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_service_name TEXT;
  v_date_str     TEXT;
BEGIN
  -- Only fire when status actually changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Fetch service name (nullable)
  SELECT name INTO v_service_name
  FROM   services
  WHERE  id = NEW.service_id;

  v_date_str := to_char(NEW.appointment_date AT TIME ZONE 'Europe/Bratislava',
                        'DD.MM.YYYY HH24:MI');

  -- scheduled: notify patient that their request was approved
  IF NEW.status = 'scheduled' AND OLD.status = 'pending' THEN
    INSERT INTO notifications (user_id, title, body, type, appointment_id)
    VALUES (
      NEW.patient_id,
      '✅ Termín potvrdený',
      COALESCE('Vaša žiadosť o termín (' || v_service_name || ', ' || v_date_str || ') bola schválená.',
               'Váš termín bol potvrdený na ' || v_date_str || '.'),
      'success',
      NEW.id
    );
  END IF;

  -- completed: notify patient; also prompt review via notification
  IF NEW.status = 'completed' THEN
    INSERT INTO notifications (user_id, title, body, type, appointment_id)
    VALUES (
      NEW.patient_id,
      '🦷 Termín dokončený',
      COALESCE('Váš termín (' || v_service_name || ', ' || v_date_str || ') bol dokončený. Ďakujeme!',
               'Váš termín bol dokončený. Ohodnoťte návštevu v appke.'),
      'success',
      NEW.id
    );
  END IF;

  -- cancelled: notify relevant party
  IF NEW.status = 'cancelled' AND OLD.status IN ('scheduled', 'pending') THEN
    -- Notify patient if doctor cancelled
    INSERT INTO notifications (user_id, title, body, type, appointment_id)
    VALUES (
      NEW.patient_id,
      '❌ Termín zrušený',
      COALESCE('Termín (' || v_service_name || ', ' || v_date_str || ') bol zrušený.',
               'Termín na ' || v_date_str || ' bol zrušený. Prosím, rezervujte si nový.'),
      'warning',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_appointment_status ON appointments;
CREATE TRIGGER trg_notify_appointment_status
  AFTER UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION notify_on_appointment_status();

-- ── 6. Row-level security: patient can only see visible plans ─
-- (RLS policy — run only if RLS is enabled on treatment_plans)
-- DROP POLICY IF EXISTS "patient_visible_plans" ON treatment_plans;
-- CREATE POLICY "patient_visible_plans" ON treatment_plans
--   FOR SELECT USING (
--     auth.uid() = patient_id AND visible_to_patient = true
--     OR auth.uid() = doctor_id
--   );

-- ── Done ──────────────────────────────────────────────────────
