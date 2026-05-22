-- ============================================================
-- Migration v32 — Payments + Staff Messages
-- ============================================================
-- Prerequisites: v31 (clinics table) must be run first
-- ============================================================

-- ── Payments table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_id       UUID NOT NULL REFERENCES auth.users(id),
  clinic_id        UUID REFERENCES public.clinics(id),
  amount_cents     INTEGER NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'EUR',
  method           TEXT NOT NULL CHECK (method IN ('cash','card','online','insurance')),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','paid','refunded','cancelled')),
  stripe_intent_id TEXT,
  paid_at          TIMESTAMPTZ,
  receipt_url      TEXT,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_patient_idx        ON public.payments (patient_id);
CREATE INDEX IF NOT EXISTS payments_appointment_idx    ON public.payments (appointment_id);
CREATE INDEX IF NOT EXISTS payments_clinic_status_idx  ON public.payments (clinic_id, status, paid_at);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_read_own_payments" ON public.payments;
CREATE POLICY "patient_read_own_payments" ON public.payments
  FOR SELECT TO authenticated USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "staff_manage_payments" ON public.payments;
CREATE POLICY "staff_manage_payments" ON public.payments
  FOR ALL TO authenticated
  USING  (public.get_my_role() IN ('owner','doctor','reception'))
  WITH CHECK (public.get_my_role() IN ('owner','doctor','reception'));

-- ── Staff messages table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID REFERENCES public.clinics(id),
  sender_id     UUID NOT NULL REFERENCES auth.users(id),
  recipient_id  UUID REFERENCES auth.users(id),  -- NULL = broadcast to all staff
  subject       TEXT,
  body          TEXT NOT NULL,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_messages_clinic_idx     ON public.staff_messages (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staff_messages_recipient_idx  ON public.staff_messages (recipient_id);
CREATE INDEX IF NOT EXISTS staff_messages_sender_idx     ON public.staff_messages (sender_id);

ALTER TABLE public.staff_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_messages_visible_to_staff" ON public.staff_messages;
CREATE POLICY "staff_messages_visible_to_staff" ON public.staff_messages
  FOR SELECT TO authenticated USING (
    public.get_my_role() IN ('owner','doctor','reception','hygienist')
    AND (
      recipient_id = auth.uid()
      OR recipient_id IS NULL
      OR sender_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "staff_can_send" ON public.staff_messages;
CREATE POLICY "staff_can_send" ON public.staff_messages
  FOR INSERT TO authenticated WITH CHECK (
    public.get_my_role() IN ('owner','doctor','reception','hygienist')
    AND sender_id = auth.uid()
  );

DROP POLICY IF EXISTS "staff_can_mark_read" ON public.staff_messages;
CREATE POLICY "staff_can_mark_read" ON public.staff_messages
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid() OR recipient_id IS NULL)
  WITH CHECK (true);
