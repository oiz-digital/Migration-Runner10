---
name: Currency symbol display rules
description: How price currency symbols are resolved in user portal pages
---
Rule in Trade.tsx and Futures.tsx fmtPrice():
- INR → prefix ₹
- USDT / USDC / USD → prefix $
- other quotes (BTC, ETH, etc.) → suffix ` ${quote}`

Rule in Predictions.tsx currencySymbol(pair):
- same logic, plus BTC→₿, ETH→Ξ

**Why:** Pairs are not always USDT; INR pairs need ₹, others need appropriate symbol.
**How to apply:** Whenever adding a new page that displays prices, use the same fmtPrice pattern.
