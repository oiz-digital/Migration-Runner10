/**
 * Portfolio Analytics — extended P&L / allocation / tax breakdown
 *
 *   GET /portfolio/analytics/summary        — equity, allocation, 24h pnl, ATH/ATL
 *   GET /portfolio/analytics/history?days=  — daily equity curve (synthetic fallback)
 *   GET /portfolio/analytics/tax-report     — Indian 1% TDS computation for filled trades
 */
import { Router, type IRouter } from "express";
import { db, walletsTable, coinsTable, ordersTable, tradesTable } from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/portfolio/analytics/summary", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const wallets = await db.select({
    id: walletsTable.id,
    walletType: walletsTable.walletType,
    coinId: walletsTable.coinId,
    balance: walletsTable.balance,
    locked: walletsTable.locked,
    coinSymbol: coinsTable.symbol,
    coinName: coinsTable.name,
    coinIcon: coinsTable.logoUrl,
    coinPrice: coinsTable.currentPrice,
    coinChange24h: coinsTable.change24h,
  }).from(walletsTable)
    .leftJoin(coinsTable, eq(coinsTable.id, walletsTable.coinId))
    .where(eq(walletsTable.userId, userId));

  let totalUsd = 0;
  let totalChangeUsd = 0;
  const allocation: Array<{ symbol: string; name: string; icon: string | null; valueUsd: number; pct: number; change24hPct: number; balance: number }> = [];
  for (const w of wallets) {
    const total = Number(w.balance) + Number(w.locked);
    if (total <= 0) continue;
    const price = Number(w.coinPrice ?? 0);
    const valueUsd = total * price;
    const ch24 = Number(w.coinChange24h ?? 0);
    const valueYesterday = valueUsd / (1 + ch24 / 100);
    totalChangeUsd += valueUsd - valueYesterday;
    totalUsd += valueUsd;
    allocation.push({
      symbol: w.coinSymbol ?? "?",
      name: w.coinName ?? "?",
      icon: w.coinIcon ?? null,
      valueUsd,
      pct: 0,
      change24hPct: ch24,
      balance: total,
    });
  }
  for (const a of allocation) a.pct = totalUsd > 0 ? (a.valueUsd / totalUsd) * 100 : 0;
  allocation.sort((a, b) => b.valueUsd - a.valueUsd);

  res.json({
    totalEquityUsd: totalUsd,
    pnl24hUsd: totalChangeUsd,
    pnl24hPct: totalUsd > 0 ? (totalChangeUsd / totalUsd) * 100 : 0,
    activeAssets: allocation.length,
    allocation,
  });
});

router.get("/portfolio/analytics/history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const days = Math.min(365, Math.max(7, Number(req.query.days ?? 30)));

  // Read current equity and synthesize a smooth curve backwards using each
  // coin's recent change percentage. This keeps the chart meaningful without
  // requiring a snapshots table (which we'd need a daily worker for).
  const wallets = await db.select({
    balance: walletsTable.balance,
    locked: walletsTable.locked,
    coinPrice: coinsTable.currentPrice,
    coinChange24h: coinsTable.change24h,
  }).from(walletsTable)
    .leftJoin(coinsTable, eq(coinsTable.id, walletsTable.coinId))
    .where(eq(walletsTable.userId, userId));

  let currentUsd = 0;
  let weightedDailyChange = 0;
  for (const w of wallets) {
    const total = Number(w.balance) + Number(w.locked);
    const price = Number(w.coinPrice ?? 0);
    const v = total * price;
    if (v <= 0) continue;
    currentUsd += v;
    weightedDailyChange += v * (Number(w.coinChange24h ?? 0) / 100);
  }
  const avgDaily = currentUsd > 0 ? weightedDailyChange / currentUsd : 0;

  // Walk backwards: each prev-day equity is current / (1 + dailyChange + jitter)
  const points: Array<{ date: string; equityUsd: number }> = [];
  let v = currentUsd;
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setUTCDate(d.getUTCDate() - i); d.setUTCHours(0, 0, 0, 0);
    points.unshift({ date: d.toISOString().slice(0, 10), equityUsd: v });
    const jitter = (Math.sin(i * 1.3) * 0.005) + (Math.cos(i * 0.7) * 0.003);
    v = v / (1 + (avgDaily * 0.5) + jitter);
    if (v < 0) v = currentUsd * 0.5;
  }
  res.json({ days, points });
});

router.get("/portfolio/analytics/tax-report", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const fyStart = typeof req.query.from === "string" ? new Date(req.query.from) : new Date(new Date().getFullYear(), 3, 1);
  if (isNaN(fyStart.getTime())) { res.status(400).json({ error: "bad from date" }); return; }

  // Indian crypto tax: 1% TDS on each SELL, 30% flat tax on profits, no offset.
  const trades = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.userId, userId), gte(tradesTable.createdAt, fyStart)))
    .orderBy(desc(tradesTable.createdAt))
    .limit(5000);

  let totalBuyUsd = 0, totalSellUsd = 0, tdsPaidUsd = 0, totalFeesUsd = 0;
  let buyCount = 0, sellCount = 0;
  for (const t of trades) {
    const notional = Number(t.price) * Number(t.qty);
    const fee = Number(t.fee ?? 0);
    totalFeesUsd += fee;
    if (t.side === "buy") { totalBuyUsd += notional; buyCount++; }
    else { totalSellUsd += notional; sellCount++; tdsPaidUsd += notional * 0.01; }
  }
  const grossPnl = totalSellUsd - totalBuyUsd;
  const taxableProfit = Math.max(0, grossPnl);
  const incomeTax = taxableProfit * 0.30;

  res.json({
    fyStart: fyStart.toISOString(),
    totals: {
      totalBuyUsd,
      totalSellUsd,
      totalFeesUsd,
      grossPnl,
      buyCount,
      sellCount,
      tradeCount: trades.length,
    },
    tax: {
      tdsPaidUsd,
      taxableProfit,
      incomeTaxUsd: incomeTax,
      totalTaxLiabilityUsd: incomeTax,
      effectiveRatePct: totalSellUsd > 0 ? (incomeTax / totalSellUsd) * 100 : 0,
    },
    note: "Indian crypto tax: 1% TDS on every sell, 30% flat tax on net profits. Losses cannot be offset against other income.",
  });
});

export default router;
