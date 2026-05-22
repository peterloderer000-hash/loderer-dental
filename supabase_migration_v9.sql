-- ═══════════════════════════════════════════════════════════════════════════
-- Loderer Dental App — Migrácia v9
-- Správy (messaging) medzi pacientom a doktorom
-- Supabase Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Tabuľka správ
CREATE TABLE IF NOT EXISTS public.messages (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body        text        NOT NULL CHECK (char_length(trim(body)) > 0),
  is_read     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- 2. Indexy
CREATE INDEX IF NOT EXISTS idx_messages_sender   ON public.messages (sender_id,   created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON public.messages (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_pair     ON public.messages (sender_id, receiver_id);

-- 3. RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Vidieť správy, kde si odosielateľ alebo príjemca
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Posielať správy len ako prihlásený odosielateľ
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- Označiť ako prečítané — iba príjemca
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE USING (receiver_id = auth.uid())
  WITH CHECK (receiver_id = auth.uid());

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- 5. Overenie
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'messages' ORDER BY ordinal_position;

-- ═══════════════════════════════════════════════════════════════════════════
-- HOTOVO:
--   ✅ messages table s RLS
--   ✅ Realtime subscription pre live chat
-- ═══════════════════════════════════════════════════════════════════════════
