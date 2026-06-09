---
name: Mobile app design patterns
description: Key patterns for the Zebvix Expo mobile app — charts, animations, spark data, API shape
---

## Chart components
- `SparkLine.tsx` — SVG polyline + gradient fill using `react-native-svg`. Needs unique `id` prop to avoid gradient ID collisions on the same screen.
- `CandleChart.tsx` — Full OHLCV SVG chart with timeframe selector (1m/5m/15m/1h/4h/1d). Fetches from `/api/klines?symbol=BTCUSDT&interval=1h&limit=60`. Response: `{ candles: [{time,open,high,low,close,volume}] }`.
- `AnimatedPrice.tsx` — Uses `react-native-reanimated` `withSequence`/`withDelay` to flash green/red background when price changes.

## Deterministic spark data (no extra API calls in list views)
```ts
function genSparkData(price: number, change24h: number, symbol: string, n = 20): number[] {
  let seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const start = price / (1 + change24h / 100);
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push(Math.max(start + start * (change24h / 100) * t + (rng() - 0.5) * start * 0.012, 1e-8));
  }
  pts[n - 1] = price;
  return pts;
}
```
**Why:** Seeded RNG means same symbol always produces same visual shape — no flicker on re-renders. Used in Home and Markets list views.

## Design tokens (always dark)
- bg: `#080e1a`, card: `#0d1524`, border: `#1a2540`
- primary: `#eb9100` (amber), success: `#22c55e`, destructive: `#e81515`, mutedForeground: `#6b7a9e`

## Screens added in professional upgrade
- `app/convert/index.tsx` — quick swap with coin picker modal, slippage selector
- `app/copy-trading/index.tsx` — trader cards with 30d/90d ROI, sparklines, follow button
- `app/portfolio/index.tsx` — allocation bar + allocation legend + asset table with progress bars
- `app/notifications/index.tsx` — typed notification list with icons per type
- Futures screen — live price + leverage selector + position size calculator
- Earn screen — pool cards with APY + stake modal
- AI Trading — plan cards with risk gradient + invest modal
- Orders — open/filled/cancelled tabs with fill progress bar + cancel button
