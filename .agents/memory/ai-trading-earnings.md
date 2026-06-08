---
name: AI trading subscription earnings
description: Where AI-bot subscription P&L comes from and why serialization must use the persisted value
---

# AI trading subscription earnings are authoritative on the row

The credit engine (`ai-credit-engine.ts`) is the single source of truth for AI-bot
earnings. On each credit cycle it inserts an earnings row, credits the user wallet,
and updates `aiTradingSubscriptionsTable.totalEarned` (signed — losses are negative,
capped at a fraction of accrued profit). The engine only processes `status="active"`
subscriptions.

**Rule:** When serializing a subscription for the API (`serializeSub`), use the
persisted `s.totalEarned` directly. Do NOT re-project earnings from elapsed
wall-clock days (`now - startedAt`).

**Why:** A live elapsed-day projection never freezes. For no-expire bots
(`expiresAt = null`), a stopped/cancelled bot would keep "earning" forever because
there is no `durationDays` cap to bound it. It also double-counts vs. what was
actually credited to the wallet. Using the stored value freezes accrual the moment
a bot is stopped (engine skips non-active rows) and always matches the wallet.

**How to apply:** Any display/summary value derived from a subscription (currentValue,
totalEarned, P&L stats) must read from the persisted column, not recompute from time.
If you ever want a smooth "projected next credit" preview, expose it as a separate,
clearly-named estimated field — never overwrite the authoritative `totalEarned`.

Related: no-expire bots are modeled by `expiresAt = null` (column is nullable). The
credit engine's `isExpired` guards on `expiresAt != null` so null-expiry bots are
never auto-completed.
