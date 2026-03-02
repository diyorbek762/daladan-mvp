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

-- 5. Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES produce_listings(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
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

-- 8. RLS Policies (drop-if-exists for idempotency)

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

DROP POLICY IF EXISTS "Farmers can insert own listings" ON produce_listings;
CREATE POLICY "Farmers can insert own listings"
  ON produce_listings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = seller_id);

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

-- ORDERS
DROP POLICY IF EXISTS "Orders viewable by involved parties" ON orders;
CREATE POLICY "Orders viewable by involved parties"
  ON orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() = buyer_id
    OR auth.uid() = driver_id
    OR auth.uid() IN (SELECT seller_id FROM produce_listings WHERE id = product_id)
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'driver')
  );

DROP POLICY IF EXISTS "Buyers can create orders" ON orders;
CREATE POLICY "Buyers can create orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Involved parties can update orders" ON orders;
CREATE POLICY "Involved parties can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = buyer_id
    OR auth.uid() = driver_id
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'driver')
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
