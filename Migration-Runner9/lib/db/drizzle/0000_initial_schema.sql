-- ============================================================
-- CryptoX / Zebvix Exchange — Initial production migration
-- Generated from Drizzle ORM schema (lib/db/src/schema/)
-- Run once on a fresh production database.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── ENUMS ───────────────────────────────────────────────────
CREATE TYPE user_role        AS ENUM ('user','admin','superadmin','support');
CREATE TYPE kyc_status       AS ENUM ('none','pending','approved','rejected');
CREATE TYPE order_side       AS ENUM ('buy','sell');
CREATE TYPE order_type       AS ENUM ('market','limit','stop_limit','stop_market');
CREATE TYPE order_status     AS ENUM ('pending','open','partially_filled','filled','cancelled','rejected','expired');
CREATE TYPE tx_status        AS ENUM ('pending','processing','approved','rejected','failed','refunded');
CREATE TYPE deposit_source   AS ENUM ('manual','auto','gateway');
CREATE TYPE coin_status      AS ENUM ('active','inactive','delisted');
CREATE TYPE earn_type        AS ENUM ('flexible','locked');
CREATE TYPE bot_type         AS ENUM ('grid','dca','market_maker');
CREATE TYPE position_side    AS ENUM ('long','short');
CREATE TYPE margin_mode      AS ENUM ('cross','isolated');
CREATE TYPE futures_status   AS ENUM ('open','closed','liquidated');
CREATE TYPE p2p_status       AS ENUM ('open','locked','completed','cancelled','disputed','expired');
CREATE TYPE p2p_trade_status AS ENUM ('waiting_payment','paid','released','cancelled','disputed');
CREATE TYPE notification_type AS ENUM ('trade','deposit','withdrawal','kyc','system','alert','promo','referral');
CREATE TYPE provider_type    AS ENUM ('evm','bitcoin','tron','solana','manual');
CREATE TYPE option_side      AS ENUM ('call','put');
CREATE TYPE option_status    AS ENUM ('open','exercised','expired');

-- ─── CORE TABLES ─────────────────────────────────────────────

CREATE TABLE users (
  id                 SERIAL PRIMARY KEY,
  email              TEXT UNIQUE NOT NULL,
  phone              TEXT,
  password_hash      TEXT,
  role               user_role NOT NULL DEFAULT 'user',
  kyc_status         kyc_status NOT NULL DEFAULT 'none',
  is_active          BOOLEAN NOT NULL DEFAULT true,
  is_email_verified  BOOLEAN NOT NULL DEFAULT false,
  referral_code      TEXT UNIQUE,
  referred_by        INTEGER REFERENCES users(id),
  two_fa_secret      TEXT,
  two_fa_enabled     BOOLEAN NOT NULL DEFAULT false,
  last_login_at      TIMESTAMPTZ,
  login_ip           INET,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_profiles (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name    TEXT,
  last_name     TEXT,
  display_name  TEXT,
  avatar_url    TEXT,
  date_of_birth DATE,
  address       TEXT,
  city          TEXT,
  state         TEXT,
  country       TEXT NOT NULL DEFAULT 'IN',
  pan_number    TEXT,
  aadhaar_last4 TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_sessions (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip         INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE user_api_keys (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  permissions  TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── KYC ─────────────────────────────────────────────────────
CREATE TABLE kyc_submissions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pan_number      TEXT,
  aadhaar_number  TEXT,
  selfie_url      TEXT,
  pan_url         TEXT,
  aadhaar_url     TEXT,
  status          kyc_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  reviewed_by     INTEGER REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── COINS & NETWORKS ────────────────────────────────────────
CREATE TABLE coins (
  id               SERIAL PRIMARY KEY,
  symbol           TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  decimals         INTEGER NOT NULL DEFAULT 8,
  price_source     TEXT NOT NULL DEFAULT 'internal',
  price_symbol     TEXT,
  status           coin_status NOT NULL DEFAULT 'active',
  is_listed        BOOLEAN NOT NULL DEFAULT true,
  list_date        DATE,
  logo_url         TEXT,
  description      TEXT,
  website_url      TEXT,
  whitepaper_url   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE networks (
  id                   SERIAL PRIMARY KEY,
  coin_id              INTEGER NOT NULL REFERENCES coins(id),
  name                 TEXT NOT NULL,
  chain                TEXT NOT NULL,
  provider_type        provider_type NOT NULL DEFAULT 'manual',
  contract_address     TEXT,
  node_address         TEXT,
  hot_wallet_address   TEXT,
  hot_wallet_key_enc   TEXT,
  explorer_url         TEXT,
  min_deposit          NUMERIC(28,8) NOT NULL DEFAULT 0,
  min_withdrawal       NUMERIC(28,8) NOT NULL DEFAULT 0,
  withdrawal_fee       NUMERIC(28,8) NOT NULL DEFAULT 0,
  required_confirmations INTEGER NOT NULL DEFAULT 12,
  deposit_enabled      BOOLEAN NOT NULL DEFAULT true,
  withdrawal_enabled   BOOLEAN NOT NULL DEFAULT true,
  memo_required        BOOLEAN NOT NULL DEFAULT false,
  auto_sweep_enabled   BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deposit_addresses (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network_id INTEGER NOT NULL REFERENCES networks(id),
  address    TEXT NOT NULL,
  memo       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, network_id)
);

-- ─── WALLETS & BALANCES ──────────────────────────────────────
CREATE TABLE wallets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_id     INTEGER NOT NULL REFERENCES coins(id),
  balance     NUMERIC(28,8) NOT NULL DEFAULT 0,
  locked      NUMERIC(28,8) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, coin_id)
);

-- ─── TRADING PAIRS ───────────────────────────────────────────
CREATE TABLE pairs (
  id              SERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL UNIQUE,
  base_coin_id    INTEGER NOT NULL REFERENCES coins(id),
  quote_coin_id   INTEGER NOT NULL REFERENCES coins(id),
  min_order_qty   NUMERIC(28,8) NOT NULL DEFAULT 0.0001,
  tick_size       NUMERIC(28,8) NOT NULL DEFAULT 0.01,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_futures      BOOLEAN NOT NULL DEFAULT false,
  maker_fee       NUMERIC(8,6) NOT NULL DEFAULT 0.001,
  taker_fee       NUMERIC(8,6) NOT NULL DEFAULT 0.001,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ORDERS ──────────────────────────────────────────────────
CREATE TABLE orders (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  pair_id         INTEGER NOT NULL REFERENCES pairs(id),
  side            order_side NOT NULL,
  type            order_type NOT NULL,
  qty             NUMERIC(28,8) NOT NULL,
  price           NUMERIC(28,8),
  stop_price      NUMERIC(28,8),
  filled_qty      NUMERIC(28,8) NOT NULL DEFAULT 0,
  avg_fill_price  NUMERIC(28,8),
  status          order_status NOT NULL DEFAULT 'pending',
  tds_deducted    NUMERIC(28,8) NOT NULL DEFAULT 0,
  fee             NUMERIC(28,8) NOT NULL DEFAULT 0,
  is_bot_order    BOOLEAN NOT NULL DEFAULT false,
  client_order_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_fills (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id),
  counter_id   INTEGER REFERENCES orders(id),
  price        NUMERIC(28,8) NOT NULL,
  qty          NUMERIC(28,8) NOT NULL,
  fee          NUMERIC(28,8) NOT NULL DEFAULT 0,
  side         order_side NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── TRANSACTIONS ─────────────────────────────────────────────
CREATE TABLE inr_transactions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  type            TEXT NOT NULL CHECK (type IN ('deposit','withdrawal')),
  amount          NUMERIC(18,2) NOT NULL,
  status          tx_status NOT NULL DEFAULT 'pending',
  utr             TEXT,
  gateway_id      INTEGER,
  bank_id         INTEGER,
  rejection_reason TEXT,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE crypto_transactions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  coin_id         INTEGER NOT NULL REFERENCES coins(id),
  network_id      INTEGER NOT NULL REFERENCES networks(id),
  type            TEXT NOT NULL CHECK (type IN ('deposit','withdrawal')),
  amount          NUMERIC(28,8) NOT NULL,
  fee             NUMERIC(28,8) NOT NULL DEFAULT 0,
  address         TEXT,
  tx_hash         TEXT,
  memo            TEXT,
  status          tx_status NOT NULL DEFAULT 'pending',
  source          deposit_source NOT NULL DEFAULT 'manual',
  confirmations   INTEGER NOT NULL DEFAULT 0,
  rejection_reason TEXT,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── BANK ACCOUNTS ───────────────────────────────────────────
CREATE TABLE bank_accounts (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_name       TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  ifsc_code       TEXT NOT NULL,
  account_name    TEXT NOT NULL,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  is_verified     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── FUTURES ─────────────────────────────────────────────────
CREATE TABLE futures_positions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  pair_id         INTEGER NOT NULL REFERENCES pairs(id),
  side            position_side NOT NULL,
  margin_mode     margin_mode NOT NULL DEFAULT 'cross',
  leverage        INTEGER NOT NULL DEFAULT 1,
  entry_price     NUMERIC(28,8) NOT NULL,
  mark_price      NUMERIC(28,8) NOT NULL DEFAULT 0,
  qty             NUMERIC(28,8) NOT NULL,
  margin          NUMERIC(28,8) NOT NULL,
  unrealized_pnl  NUMERIC(28,8) NOT NULL DEFAULT 0,
  liquidation_price NUMERIC(28,8),
  status          futures_status NOT NULL DEFAULT 'open',
  closed_pnl      NUMERIC(28,8),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── EARN / STAKING ──────────────────────────────────────────
CREATE TABLE earn_products (
  id              SERIAL PRIMARY KEY,
  coin_id         INTEGER NOT NULL REFERENCES coins(id),
  name            TEXT NOT NULL,
  earn_type       earn_type NOT NULL DEFAULT 'flexible',
  apy             NUMERIC(8,4) NOT NULL,
  min_amount      NUMERIC(28,8) NOT NULL DEFAULT 0,
  max_amount      NUMERIC(28,8),
  lock_days       INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  total_supply    NUMERIC(28,8),
  vip_level       INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE earn_subscriptions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  product_id      INTEGER NOT NULL REFERENCES earn_products(id),
  coin_id         INTEGER NOT NULL REFERENCES coins(id),
  amount          NUMERIC(28,8) NOT NULL,
  earned          NUMERIC(28,8) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','redeemed','matured')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matures_at      TIMESTAMPTZ,
  redeemed_at     TIMESTAMPTZ
);

-- ─── P2P ─────────────────────────────────────────────────────
CREATE TABLE p2p_orders (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  coin_id         INTEGER NOT NULL REFERENCES coins(id),
  side            order_side NOT NULL,
  price_per_unit  NUMERIC(28,8) NOT NULL,
  total_amount    NUMERIC(28,8) NOT NULL,
  remaining       NUMERIC(28,8) NOT NULL,
  min_trade       NUMERIC(28,8) NOT NULL DEFAULT 0,
  max_trade       NUMERIC(28,8),
  payment_methods TEXT[] NOT NULL DEFAULT '{}',
  status          p2p_status NOT NULL DEFAULT 'open',
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE p2p_trades (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES p2p_orders(id),
  buyer_id        INTEGER NOT NULL REFERENCES users(id),
  seller_id       INTEGER NOT NULL REFERENCES users(id),
  amount          NUMERIC(28,8) NOT NULL,
  price           NUMERIC(28,8) NOT NULL,
  status          p2p_trade_status NOT NULL DEFAULT 'waiting_payment',
  payment_method  TEXT,
  payment_proof   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── NOTIFICATIONS & ALERTS ──────────────────────────────────
CREATE TABLE notifications (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         notification_type NOT NULL DEFAULT 'system',
  title        TEXT NOT NULL,
  body         TEXT,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  action_url   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE price_alerts (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pair_id      INTEGER NOT NULL REFERENCES pairs(id),
  direction    TEXT NOT NULL CHECK (direction IN ('above','below')),
  price        NUMERIC(28,8) NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  triggered_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── REFERRALS ───────────────────────────────────────────────
CREATE TABLE referral_rewards (
  id              SERIAL PRIMARY KEY,
  referrer_id     INTEGER NOT NULL REFERENCES users(id),
  referred_id     INTEGER NOT NULL REFERENCES users(id),
  reward_coin_id  INTEGER NOT NULL REFERENCES coins(id),
  amount          NUMERIC(28,8) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','credited','expired')),
  credited_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── BOTS ────────────────────────────────────────────────────
CREATE TABLE bots (
  id                    SERIAL PRIMARY KEY,
  pair_id               INTEGER NOT NULL REFERENCES pairs(id) UNIQUE,
  bot_type              bot_type NOT NULL DEFAULT 'market_maker',
  is_enabled            BOOLEAN NOT NULL DEFAULT false,
  spread_pct            NUMERIC(8,4) NOT NULL DEFAULT 0.5,
  levels                INTEGER NOT NULL DEFAULT 5,
  base_size             NUMERIC(28,8) NOT NULL DEFAULT 1,
  drift_pct             NUMERIC(8,4) NOT NULL DEFAULT 0.1,
  refresh_sec           INTEGER NOT NULL DEFAULT 30,
  market_taker_enabled  BOOLEAN NOT NULL DEFAULT false,
  market_taker_size_mult NUMERIC(8,4) NOT NULL DEFAULT 2.0,
  market_taker_cooldown_sec INTEGER NOT NULL DEFAULT 30,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CMS ─────────────────────────────────────────────────────
CREATE TABLE banners (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  subtitle      TEXT,
  cta_text      TEXT,
  cta_url       TEXT,
  bg_color      TEXT NOT NULL DEFAULT '#1a1a2e',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  priority      INTEGER NOT NULL DEFAULT 0,
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE news_articles (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  summary      TEXT,
  body         TEXT,
  source       TEXT,
  image_url    TEXT,
  external_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE announcements (
  id          SERIAL PRIMARY KEY,
  category    TEXT NOT NULL DEFAULT 'product',
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  cta_href    TEXT,
  cta_label   TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE promotions (
  id          SERIAL PRIMARY KEY,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  subtitle    TEXT,
  tag         TEXT,
  color       TEXT,
  icon        TEXT,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── COPY TRADING ────────────────────────────────────────────
CREATE TABLE copy_traders (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) UNIQUE,
  display_name    TEXT NOT NULL,
  bio             TEXT,
  performance_fee NUMERIC(5,2) NOT NULL DEFAULT 5,
  total_pnl       NUMERIC(28,8) NOT NULL DEFAULT 0,
  win_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
  followers_count INTEGER NOT NULL DEFAULT 0,
  is_public       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE copy_follows (
  id              SERIAL PRIMARY KEY,
  follower_id     INTEGER NOT NULL REFERENCES users(id),
  trader_id       INTEGER NOT NULL REFERENCES copy_traders(id),
  allocation_pct  NUMERIC(5,2) NOT NULL DEFAULT 10,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_id, trader_id)
);

-- ─── EXCHANGE SETTINGS ───────────────────────────────────────
CREATE TABLE exchange_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE fee_configs (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  vip_level   INTEGER NOT NULL DEFAULT 0,
  maker_fee   NUMERIC(8,6) NOT NULL DEFAULT 0.001,
  taker_fee   NUMERIC(8,6) NOT NULL DEFAULT 0.0015,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE email_configs (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  provider    TEXT NOT NULL CHECK (provider IN ('smtp','sendgrid','mailgun','postmark','ses')),
  from_email  TEXT,
  from_name   TEXT,
  smtp_host   TEXT,
  smtp_port   INTEGER,
  smtp_secure BOOLEAN DEFAULT false,
  username    TEXT,
  password    TEXT,
  api_key     TEXT,
  domain      TEXT,
  region      TEXT DEFAULT 'us',
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sms_providers (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  provider    TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'sms',
  api_key     TEXT,
  sender_id   TEXT,
  template_id TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_gateways (
  id              SERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  provider        TEXT NOT NULL,
  config          JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT false,
  deposit_enabled BOOLEAN NOT NULL DEFAULT true,
  withdrawal_enabled BOOLEAN NOT NULL DEFAULT false,
  min_deposit     NUMERIC(18,2) NOT NULL DEFAULT 100,
  max_deposit     NUMERIC(18,2),
  min_withdrawal  NUMERIC(18,2) NOT NULL DEFAULT 500,
  max_withdrawal  NUMERIC(18,2),
  fee_pct         NUMERIC(6,4) NOT NULL DEFAULT 0,
  fee_fixed       NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE custom_apis (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  url             TEXT NOT NULL,
  method          TEXT NOT NULL DEFAULT 'GET',
  headers         JSONB NOT NULL DEFAULT '{}',
  body_template   TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_tested_at  TIMESTAMPTZ,
  last_status     INTEGER,
  last_latency_ms INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUDIT & ACTIVITY ────────────────────────────────────────
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    INTEGER REFERENCES users(id),
  actor_email TEXT,
  actor_role  TEXT,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  action      TEXT NOT NULL,
  diff        JSONB,
  ip          INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE activity_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  event_type  TEXT NOT NULL,
  payload     JSONB,
  ip          INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── OTP ─────────────────────────────────────────────────────
CREATE TABLE otp_codes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────────────────────
CREATE INDEX idx_users_email          ON users(email);
CREATE INDEX idx_users_referral_code  ON users(referral_code);
CREATE INDEX idx_orders_user          ON orders(user_id);
CREATE INDEX idx_orders_pair_status   ON orders(pair_id, status);
CREATE INDEX idx_orders_created       ON orders(created_at DESC);
CREATE INDEX idx_fills_order          ON order_fills(order_id);
CREATE INDEX idx_wallets_user         ON wallets(user_id);
CREATE INDEX idx_notifications_user   ON notifications(user_id, is_read);
CREATE INDEX idx_crypto_tx_user       ON crypto_transactions(user_id);
CREATE INDEX idx_crypto_tx_hash       ON crypto_transactions(tx_hash);
CREATE INDEX idx_inr_tx_user          ON inr_transactions(user_id);
CREATE INDEX idx_earn_sub_user        ON earn_subscriptions(user_id);
CREATE INDEX idx_audit_actor          ON audit_log(actor_id);
CREATE INDEX idx_audit_created        ON audit_log(created_at DESC);
CREATE INDEX idx_activity_user        ON activity_events(user_id);
CREATE INDEX idx_price_alerts_pair    ON price_alerts(pair_id, is_active);
CREATE INDEX idx_futures_user_status  ON futures_positions(user_id, status);
CREATE INDEX idx_p2p_orders_status    ON p2p_orders(status);
CREATE INDEX idx_deposit_addr_user    ON deposit_addresses(user_id);

-- ─── DEFAULT SEED DATA ───────────────────────────────────────
INSERT INTO exchange_settings (key, value) VALUES
  ('maintenance', '{"enabled": false, "message": "We are currently undergoing scheduled maintenance. We''ll be back shortly.", "eta": ""}'),
  ('features',    '{"showFutures": true, "showP2P": true, "showConvert": true, "showEarn": true, "showLeagues": true, "showNews": true, "showAnnouncements": true, "showDex": true, "showTools": true, "showSignup": true, "showLogin": true, "signupBonusZbx": 50}'),
  ('tds_rate',    '{"rate": 0.01, "enabled": true}'),
  ('trading',     '{"defaultMakerFee": 0.001, "defaultTakerFee": 0.0015, "maxLeverage": 100}')
ON CONFLICT (key) DO NOTHING;

