---
name: Live mode setup
description: What was done to transition from demo to live mode
---
- Cleaned all demo data: orders, futures_orders, trades, sessions, wallets, ai_trading_subscriptions, bot_trades, p2p_* tables
- Seeded 8 live AI trading plans (no `currency` column in ai_trading_plans table — it doesn't exist)
- Set 23 exchange_settings keys: exchange_mode=live, trading_enabled=true, p2p_enabled=true, ai_trading_enabled=true, etc.
- Market-making bots (5) auto-create live order book; 871+ orders are bot-generated (expected)
- Admin credentials: admin@cryptox.com / Admin@123 (role=admin, id=1)
- Futures orders: Go service not installed; fallback makes limit orders rest as OPEN in DB

**Why:** User requested full live mode upgrade from demo state.
