-- Migration v35: Shop orders
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.shop_orders (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  items       JSONB NOT NULL DEFAULT '[]',
  total_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending, ready, picked_up, cancelled
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_orders_patient ON public.shop_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON public.shop_orders(status);

ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_orders_select" ON public.shop_orders;
CREATE POLICY "shop_orders_select" ON public.shop_orders
  FOR SELECT USING (
    auth.uid() = patient_id
    OR get_my_role() IN ('doctor', 'reception')
  );

DROP POLICY IF EXISTS "shop_orders_insert" ON public.shop_orders;
CREATE POLICY "shop_orders_insert" ON public.shop_orders
  FOR INSERT WITH CHECK (
    auth.uid() = patient_id
  );

DROP POLICY IF EXISTS "shop_orders_update" ON public.shop_orders;
CREATE POLICY "shop_orders_update" ON public.shop_orders
  FOR UPDATE USING (
    get_my_role() IN ('doctor', 'reception')
  );
