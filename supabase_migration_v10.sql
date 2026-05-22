-- ─── Migration v10: Čakacia listina (Waiting List) ───────────────────────────
-- Run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS public.waiting_list (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id     uuid        REFERENCES public.services(id) ON DELETE SET NULL,
  preferred_date date,
  notes          text,
  status         text        NOT NULL DEFAULT 'waiting'
                             CHECK (status IN ('waiting', 'contacted', 'booked', 'cancelled')),
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE public.waiting_list ENABLE ROW LEVEL SECURITY;

-- Pacient spravuje vlastné záznamy
CREATE POLICY "Patient manages own waiting list" ON public.waiting_list
  FOR ALL
  USING  (patient_id = auth.uid())
  WITH CHECK (patient_id = auth.uid());

-- Doktor číta všetky záznamy
CREATE POLICY "Doctor reads waiting list" ON public.waiting_list
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'doctor'
  ));

-- Doktor môže aktualizovať status
CREATE POLICY "Doctor updates waiting list status" ON public.waiting_list
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'doctor'
  ));

-- ─── Trigger: notifikácia doktorovi pri novom zápise na čakaciu listinu ────────
CREATE OR REPLACE FUNCTION fn_waiting_list_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_name  text;
  v_service_name  text;
  v_doctor_id     uuid;
  v_body          text;
BEGIN
  SELECT full_name INTO v_patient_name FROM profiles WHERE id = NEW.patient_id;
  SELECT name      INTO v_service_name FROM services  WHERE id = NEW.service_id;
  SELECT id        INTO v_doctor_id    FROM profiles  WHERE role = 'doctor' LIMIT 1;

  IF v_doctor_id IS NULL THEN RETURN NEW; END IF;

  v_body := COALESCE(v_patient_name, 'Pacient') || ' sa zapísal na čakaciu listinu'
    || CASE WHEN v_service_name IS NOT NULL THEN ' (' || v_service_name || ')' ELSE '' END
    || CASE WHEN NEW.preferred_date IS NOT NULL THEN ' na ' || to_char(NEW.preferred_date, 'DD.MM.YYYY') ELSE '' END
    || '.';

  INSERT INTO notifications(user_id, title, body, type)
  VALUES (v_doctor_id, '⏳ Nový zápis na čakaciu listinu', v_body, 'info');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_waiting_list_notification ON public.waiting_list;
CREATE TRIGGER trg_waiting_list_notification
  AFTER INSERT ON public.waiting_list
  FOR EACH ROW
  EXECUTE FUNCTION fn_waiting_list_notification();
