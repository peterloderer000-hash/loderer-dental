-- Migration v15: Push notification token na profiles
-- Spusti v Supabase SQL Editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Voliteľný index pre rýchle vyhľadávanie podľa tokenu
CREATE INDEX IF NOT EXISTS profiles_push_token_idx ON profiles (push_token)
  WHERE push_token IS NOT NULL;
