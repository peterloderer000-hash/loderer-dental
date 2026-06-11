-- ================================================================
-- Migrácia v40: Fáza 3-4 — waitlist, invoices, video, sms
-- ================================================================

-- Waitlist (Smart čakací zoznam)
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  service TEXT,
  preferred_date DATE,
  preferred_time TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'booked', 'expired')),
  notes TEXT,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waitlist_doctor_all" ON waitlist
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('doctor', 'owner'))
  );

CREATE POLICY "waitlist_patient_own" ON waitlist
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid());

CREATE POLICY "waitlist_patient_insert" ON waitlist
  FOR INSERT TO authenticated
  WITH CHECK (patient_id = auth.uid());

-- Invoices (Faktúry)
CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  appointment_id UUID,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  invoice_number TEXT,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_doctor_all" ON invoices
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('doctor', 'owner', 'reception'))
  );

CREATE POLICY "invoices_patient_own" ON invoices
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid());

-- Add invoice_id to appointments if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'invoice_id') THEN
    ALTER TABLE appointments ADD COLUMN invoice_id UUID REFERENCES invoices(id);
  END IF;
END $$;

-- Video Consultations
CREATE TABLE IF NOT EXISTS video_consultations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID REFERENCES profiles(id),
  patient_id UUID REFERENCES profiles(id),
  date DATE NOT NULL,
  time TEXT,
  duration_minutes INT DEFAULT 15,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  reason TEXT,
  room_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE video_consultations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_doctor_all" ON video_consultations
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('doctor', 'owner'))
  );

CREATE POLICY "video_patient_own" ON video_consultations
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid());

-- SMS Logs
CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES profiles(id),
  phone TEXT,
  message TEXT,
  type TEXT DEFAULT 'reminder' CHECK (type IN ('reminder', 'recall', 'custom')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  twilio_sid TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_doctor_all" ON sms_logs
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('doctor', 'owner'))
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_patient ON waitlist(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_video_date ON video_consultations(date);
CREATE INDEX IF NOT EXISTS idx_sms_patient ON sms_logs(patient_id);
