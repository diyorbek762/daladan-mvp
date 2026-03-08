-- ============================================
-- DALADAN — Full Database Schema & RLS
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Custom ENUM types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('farmer', 'buyer', 'driver', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'awaiting_driver', 'driver_assigned', 'completed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone_number TEXT UNIQUE NOT NULL,
  region TEXT,
  role user_role NOT NULL DEFAULT 'buyer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Produce listings table
CREATE TABLE IF NOT EXISTS produce_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  latitude FLOAT,
  longitude FLOAT,
  display_location TEXT,
  seller_can_deliver BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Buyer requests table
CREATE TABLE IF NOT EXISTS buyer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  region TEXT,
  quantity NUMERIC(12,2),
  max_price NUMERIC(12,2),
  urgency_level TEXT DEFAULT 'normal',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Orders table (supports both product-based and need-based orders)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES produce_listings(id) ON DELETE CASCADE,
  request_id UUID REFERENCES buyer_requests(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL DEFAULT '',
  status order_status NOT NULL DEFAULT 'pending',
  delivery_method TEXT NOT NULL DEFAULT 'self_pickup',
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Indexes for fast sorting
CREATE INDEX IF NOT EXISTS idx_produce_price ON produce_listings(price);
CREATE INDEX IF NOT EXISTS idx_produce_created ON produce_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_produce_active ON produce_listings(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_buyer_requests_active ON buyer_requests(is_active) WHERE is_active = TRUE;

-- 7. Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE produce_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. RLS Policies (drop-if-exists for idempotency)
-- ============================================

-- USERS
DROP POLICY IF EXISTS "Users are viewable by authenticated users" ON users;
CREATE POLICY "Users are viewable by authenticated users"
  ON users FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON users;
CREATE POLICY "Users can insert their own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON users;
CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- PRODUCE LISTINGS
DROP POLICY IF EXISTS "Listings viewable by all authenticated" ON produce_listings;
CREATE POLICY "Listings viewable by all authenticated"
  ON produce_listings FOR SELECT
  TO authenticated
  USING (true);

-- STRICT: Only users with role='farmer' can insert listings
DROP POLICY IF EXISTS "Farmers can insert own listings" ON produce_listings;
CREATE POLICY "Farmers can insert own listings"
  ON produce_listings FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = seller_id
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'farmer'
    )
  );

DROP POLICY IF EXISTS "Farmers can update own listings" ON produce_listings;
CREATE POLICY "Farmers can update own listings"
  ON produce_listings FOR UPDATE
  TO authenticated
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

-- BUYER REQUESTS
DROP POLICY IF EXISTS "Buyer requests viewable by all authenticated" ON buyer_requests;
CREATE POLICY "Buyer requests viewable by all authenticated"
  ON buyer_requests FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Buyers can insert own requests" ON buyer_requests;
CREATE POLICY "Buyers can insert own requests"
  ON buyer_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Buyers can update own requests" ON buyer_requests;
CREATE POLICY "Buyers can update own requests"
  ON buyer_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = buyer_id);

-- NEW: Buyers can delete their own fulfilled requests
DROP POLICY IF EXISTS "Buyers can delete own requests" ON buyer_requests;
CREATE POLICY "Buyers can delete own requests"
  ON buyer_requests FOR DELETE
  TO authenticated
  USING (auth.uid() = buyer_id);

-- ORDERS — Tightened: involved parties + admins only
DROP POLICY IF EXISTS "Orders viewable by involved parties" ON orders;
CREATE POLICY "Orders viewable by involved parties"
  ON orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() = buyer_id
    OR auth.uid() = seller_id
    OR auth.uid() = driver_id
    OR (product_id IS NOT NULL AND auth.uid() IN (SELECT pl.seller_id FROM produce_listings pl WHERE pl.id = product_id))
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND email IN ('dedamirzayevdiyorbek9@gmail.com', 'gulomovtop@gmail.com')
    )
  );

-- Drivers need to see awaiting_driver orders to accept them
DROP POLICY IF EXISTS "Drivers can view awaiting orders" ON orders;
CREATE POLICY "Drivers can view awaiting orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    status = 'awaiting_driver'
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'driver')
  );

DROP POLICY IF EXISTS "Buyers can create orders" ON orders;
CREATE POLICY "Buyers can create orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = buyer_id);

-- Farmers can create orders when fulfilling buyer needs
DROP POLICY IF EXISTS "Farmers can create need-based orders" ON orders;
CREATE POLICY "Farmers can create need-based orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = seller_id
    AND request_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'farmer')
  );

-- UPDATE: involved parties + admins (no blanket driver access for non-own orders)
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

-- Drivers can claim awaiting_driver orders (driver_id is null, so they aren't "driver_id" yet)
DROP POLICY IF EXISTS "Drivers can claim awaiting orders" ON orders;
CREATE POLICY "Drivers can claim awaiting orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    status = 'awaiting_driver'
    AND driver_id IS NULL
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'driver')
  );

-- 9. Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at_produce BEFORE UPDATE ON produce_listings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at_requests BEFORE UPDATE ON buyer_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at_orders BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 10. Auto-create user profile on signup (SECURITY DEFINER bypasses RLS)
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

-- Drop and recreate to avoid duplicate trigger error
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 11. Auto-decrease stock when a PRODUCT-BASED order is placed (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.handle_order_stock_decrease()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Only decrease stock for product-based orders (not need-based)
  IF NEW.product_id IS NOT NULL THEN
    UPDATE produce_listings
    SET
      amount = GREATEST(0, amount - NEW.quantity),
      is_active = (GREATEST(0, amount - NEW.quantity) > 0)
    WHERE id = NEW.product_id;
  END IF;

  -- Auto-deactivate the buyer request when a need-based order is created
  IF NEW.request_id IS NOT NULL THEN
    UPDATE buyer_requests
    SET is_active = false
    WHERE id = NEW.request_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_decrease_stock ON orders;
CREATE TRIGGER on_order_decrease_stock
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_stock_decrease();

-- 12. Admin DELETE policies
DROP POLICY IF EXISTS "Admins can delete listings" ON produce_listings;
CREATE POLICY "Admins can delete listings"
  ON produce_listings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND email IN ('dedamirzayevdiyorbek9@gmail.com', 'gulomovtop@gmail.com')
    )
  );

DROP POLICY IF EXISTS "Admins can delete buyer requests" ON buyer_requests;
CREATE POLICY "Admins can delete buyer requests"
  ON buyer_requests FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND email IN ('dedamirzayevdiyorbek9@gmail.com', 'gulomovtop@gmail.com')
    )
  );

-- 13. Telegram OTP table (passwordless auth via bot)
CREATE TABLE IF NOT EXISTS telegram_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL,
  first_name TEXT,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_otps_telegram_id ON telegram_otps(telegram_id);
CREATE INDEX IF NOT EXISTS idx_telegram_otps_code ON telegram_otps(code);

ALTER TABLE telegram_otps ENABLE ROW LEVEL SECURITY;
-- No RLS policies for authenticated/anon — only the service role key can access this table.
