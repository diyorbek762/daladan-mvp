-- ============================================
-- DALADAN — Add Telegram Columns to public.users
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================

-- 1. Add Telegram columns to the existing users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS telegram_id       BIGINT UNIQUE,
  ADD COLUMN IF NOT EXISTS telegram_username  TEXT,
  ADD COLUMN IF NOT EXISTS telegram_first_name TEXT,
  ADD COLUMN IF NOT EXISTS telegram_phone     TEXT,
  ADD COLUMN IF NOT EXISTS is_bot_started     BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Index on telegram_id for fast bot lookups
CREATE INDEX IF NOT EXISTS idx_users_telegram_id
  ON public.users (telegram_id)
  WHERE telegram_id IS NOT NULL;

-- ============================================
-- 3. RLS Policies for Telegram data
-- ============================================

-- SELECT: any authenticated user can read any profile (already exists,
-- but we re-state it here for completeness & idempotency)
DROP POLICY IF EXISTS "Users are viewable by authenticated users" ON public.users;
CREATE POLICY "Users are viewable by authenticated users"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

-- UPDATE (Telegram fields): a user can only update their OWN Telegram data.
-- This is a dedicated policy so it cannot be used to change email, role, etc.
DROP POLICY IF EXISTS "Users can update own telegram data" ON public.users;
CREATE POLICY "Users can update own telegram data"
  ON public.users FOR UPDATE
  TO authenticated
  USING  (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Only allow changing the five Telegram columns; all others must stay the same.
    AND email            IS NOT DISTINCT FROM (SELECT email            FROM public.users WHERE id = auth.uid())
    AND full_name        IS NOT DISTINCT FROM (SELECT full_name        FROM public.users WHERE id = auth.uid())
    AND phone_number     IS NOT DISTINCT FROM (SELECT phone_number     FROM public.users WHERE id = auth.uid())
    AND region           IS NOT DISTINCT FROM (SELECT region           FROM public.users WHERE id = auth.uid())
    AND role             IS NOT DISTINCT FROM (SELECT role             FROM public.users WHERE id = auth.uid())
  );

-- Keep the original broad "update own profile" policy so existing
-- app code (profile edits, etc.) continues to work.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
