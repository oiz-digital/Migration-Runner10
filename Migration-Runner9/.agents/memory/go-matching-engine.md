---
name: Go Matching Engine — Node API integration
description: How the Go futures matching engine at 127.0.0.1:8090 is wired into the Node API server's futures routes.
---

## Rule
`GO_BASE` in `artifacts/api-server/src/routes/futures.ts` must point to `http://127.0.0.1:8090`.
The env var `GO_SERVICE_URL` overrides it (for production or custom bind).

**Why:** Go service binds loopback only (127.0.0.1:8090) for security. An older port constant 23004 was the wrong default and broke routing.

## How to apply
- If Go port ever changes, update `main.go` `PORT` default AND the fallback in `futures.ts`.
- Do NOT call Go ports from the public proxy — always loopback only.

## What's wired
- `POST /internal/futures/place` — match an order; returns MatchResult `{orderId, status, filledQty, remaining, avgPrice, trades[]}`.
- `POST /internal/futures/cancel` — remove resting order from book.
- `POST /internal/futures/seed` — re-seed book on Node API restart (called by `restoreBooksOnBoot()`).
- `GET /internal/futures/snapshot?pairId=X&depth=N` — orderbook depth snapshot.
- `GET /ws` — WebSocket push (futures.orderbook:N, futures.trades:N channels).

## Futures pairs enabled
BTC, ETH, BNB, SOL, XRP, DOGE, ADA, MATIC, AVAX, LINK — all paired with USDT. Enable more via `UPDATE pairs SET futures_enabled = true WHERE symbol = '...'`.

## DB schema location
`lib/db/src/schema/futures.ts` — futuresOrdersTable, futuresPositionsTable, futuresTradesTable.
