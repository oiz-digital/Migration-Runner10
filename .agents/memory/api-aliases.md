---
name: API path aliases
description: Alternative/frontend-expected paths that alias to canonical backend routes
---
File: `artifacts/api-server/src/routes/api-aliases.ts` (registered FIRST in routes/index.ts).

Aliases added:
- GET /finance/wallets → /wallets
- GET /finance/ledger → /ledger  
- GET /futures/positions → /positions
- GET /smartapi/status → /smartapi/platform-status
- GET /copy-trading/strategies → /copy/leaderboard
- GET/POST /copy-trading/follow → /copy/follow
- GET /copy-trading/me → /copy/me/following
- GET /futures/orderbook → /admin/inmem-engine/orderbook/:symbol

**Why:** Frontend and health checks called alternate paths; backend uses canonical paths.
**How to apply:** Any new path mismatch → add alias to api-aliases.ts, no logic duplication.
