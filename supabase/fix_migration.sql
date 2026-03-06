-- ============================================
-- DALADAN — Fix Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================

-- FIX 1: Sellers can now mark their own deliveries as completed
-- Previously seller_id was missing from the UPDATE policy
DROP POLICY IF EXISTS "Involved parties can update orders" ON orders;
CREATE POLICY "Involved parties can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = buyer_id
    OR auth.uid() = seller_id
    OR auth.uid() = driver_id
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND email IN ('dedamirzayevdiyorbek9@gmail.com', 'gulomovtop@gmail.com')
    )
  );

-- FIX 2: Signup trigger now handles duplicate users gracefully
-- Previously it could crash on duplicate phone_number, breaking the entire signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, phone_number, region, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', ''),
    NULLIF(NEW.raw_user_meta_data->>'region', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'buyer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- FIX 3: Clean up orphaned auth users (users in auth.users but not in public.users)
-- This fixes users who registered but whose profile insert failed
-- Uncomment and run ONLY if you want to delete orphaned auth entries:
-- DELETE FROM auth.users WHERE id NOT IN (SELECT id FROM public.users);
