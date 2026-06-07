-- Migration v36: Automatické loyalty body
-- Run this in Supabase SQL Editor

-- ═══ Trigger: +50 bodov keď termín sa zmení na 'completed' ═══
CREATE OR REPLACE FUNCTION fn_loyalty_on_appointment_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- Len keď status sa zmení na 'completed' (nie keď už bol completed)
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Skontroluj či už nemá body za tento termín
    IF NOT EXISTS (
      SELECT 1 FROM public.loyalty_points
      WHERE patient_id = NEW.patient_id
        AND appointment_id = NEW.id
        AND reason = 'appointment'
    ) THEN
      INSERT INTO public.loyalty_points (patient_id, points, reason, description, appointment_id)
      VALUES (NEW.patient_id, 50, 'appointment', 'Body za návštevu', NEW.id);

      -- Aktualizuj celkové body v profiles
      UPDATE public.profiles
      SET loyalty_total_points = COALESCE(loyalty_total_points, 0) + 50
      WHERE id = NEW.patient_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_loyalty_appointment_complete ON public.appointments;
CREATE TRIGGER trg_loyalty_appointment_complete
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_loyalty_on_appointment_complete();

-- ═══ Trigger: +25 bodov keď pacient pridá rating ═══
CREATE OR REPLACE FUNCTION fn_loyalty_on_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Len keď sa pridá nový rating (predtým bol NULL)
  IF NEW.patient_rating IS NOT NULL AND (OLD.patient_rating IS NULL) THEN
    -- Skontroluj či už nemá body za recenziu tohto termínu
    IF NOT EXISTS (
      SELECT 1 FROM public.loyalty_points
      WHERE patient_id = NEW.patient_id
        AND appointment_id = NEW.id
        AND reason = 'review'
    ) THEN
      INSERT INTO public.loyalty_points (patient_id, points, reason, description, appointment_id)
      VALUES (NEW.patient_id, 25, 'review', 'Body za recenziu', NEW.id);

      UPDATE public.profiles
      SET loyalty_total_points = COALESCE(loyalty_total_points, 0) + 25
      WHERE id = NEW.patient_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_loyalty_rating ON public.appointments;
CREATE TRIGGER trg_loyalty_rating
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_loyalty_on_rating();

-- ═══ Aktualizuj loyalty_tier na základe bodov ═══
CREATE OR REPLACE FUNCTION fn_update_loyalty_tier()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles SET loyalty_tier =
    CASE
      WHEN COALESCE(loyalty_total_points, 0) >= 1000 THEN 'platinum'
      WHEN COALESCE(loyalty_total_points, 0) >= 500  THEN 'gold'
      WHEN COALESCE(loyalty_total_points, 0) >= 200  THEN 'silver'
      ELSE 'bronze'
    END
  WHERE id = NEW.patient_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_loyalty_tier ON public.loyalty_points;
CREATE TRIGGER trg_update_loyalty_tier
  AFTER INSERT ON public.loyalty_points
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_loyalty_tier();
