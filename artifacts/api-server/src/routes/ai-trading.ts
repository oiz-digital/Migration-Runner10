import { Router, type IRouter } from "express";
import { db, aiTradingPlansTable, aiTradingSubscriptionsTable, aiTradingEarningsTable, walletsTable, coinsTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getInrRate } from "../lib/price-service";

const router: IRouter = Router();

/* ── helpers ── */

async function getSpotWallet(userId: number, symbol: string) {
  const [coin] = await db.select({ id: coinsTable.id }).from(coinsTable).where(eq(coinsTable.symbol, symbol)).limit(1);
  if (!coin) return null;
  const [wallet] = await db.select().from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.walletType, "spot"), eq(walletsTable.coinId, coin.id)))
    .limit(1);
  return wallet ? { ...wallet, coinId: coin.id } : { coinId: coin.id, balance: "0", locked: "0", id: null };
}

async function upsertSpotWallet(userId: number, symbol: string, balance: string, locked: string) {
  const [coin] = await db.select({ id: coinsTable.id }).from(coinsTable).where(eq(coinsTable.symbol, symbol)).limit(1);
  if (!coin) return;
  const [existing] = await db.select({ id: walletsTable.id }).from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.walletType, "spot"), eq(walletsTable.coinId, coin.id)))
    .limit(1);
  if (existing) {
    await db.update(walletsTable).set({ balance, locked, updatedAt: new Date() })
      .where(eq(walletsTable.id, existing.id));
  } else {
    await db.insert(walletsTable).values({ userId, walletType: "spot", coinId: coin.id, balance, locked });
  }
}

function serializePlan(p: any, investors = 0) {
  return {
    id: p.id, name: p.name, description: p.description ?? null,
    dailyReturnPercent: parseFloat(p.dailyReturnPercent),
    minInvestment: parseFloat(p.minInvestment), maxInvestment: parseFloat(p.maxInvestment),
    durationDays: p.durationDays, riskLevel: p.riskLevel,
    isActive: p.isActive, totalInvestors: investors,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  };
}

function serializeSub(s: any, plan: any) {
  const invested = parseFloat(s.investedAmount);
  const dailyPct = parseFloat(plan.dailyReturnPercent);
  const days = Math.max(0, (Date.now() - new Date(s.startedAt).getTime()) / 86400000);
  const effectiveDays = Math.min(days, plan.durationDays);
  const totalEarned = invested * (dailyPct / 100) * effectiveDays;
  return {
    id: s.id, planId: s.planId, planName: plan.name, riskLevel: plan.riskLevel,
    investedAmount: invested, currentValue: parseFloat((invested + totalEarned).toFixed(2)),
    startedAt: s.startedAt instanceof Date ? s.startedAt.toISOString() : s.startedAt,
    expiresAt: s.expiresAt instanceof Date ? s.expiresAt.toISOString() : s.expiresAt,
    status: s.status, totalEarned: parseFloat(totalEarned.toFixed(2)),
    dailyReturn: parseFloat((invested * dailyPct / 100).toFixed(2)),
  };
}

/* ── routes ── */

router.get("/ai-trading/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(aiTradingPlansTable)
    .where(eq(aiTradingPlansTable.isActive, true))
    .orderBy(desc(aiTradingPlansTable.dailyReturnPercent));
  const out = await Promise.all(plans.map(async p => {
    const [r] = await db.select({ count: count() }).from(aiTradingSubscriptionsTable)
      .where(and(eq(aiTradingSubscriptionsTable.planId, p.id), eq(aiTradingSubscriptionsTable.status, "active")));
    return serializePlan(p, r.count);
  }));
  res.json(out);
});

router.get("/ai-trading/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const subs = await db.select().from(aiTradingSubscriptionsTable)
    .where(eq(aiTradingSubscriptionsTable.userId, req.user!.id))
    .orderBy(desc(aiTradingSubscriptionsTable.createdAt));
  const out = await Promise.all(subs.map(async s => {
    const [plan] = await db.select().from(aiTradingPlansTable).where(eq(aiTradingPlansTable.id, s.planId));
    return plan ? serializeSub(s, plan) : null;
  }));
  res.json(out.filter(Boolean));
});

router.get("/ai-trading/earnings", requireAuth, async (req, res): Promise<void> => {
  const limit  = Math.min(100, parseInt(req.query.limit  as string ?? "50", 10) || 50);
  const offset =               parseInt(req.query.offset as string ?? "0",  10) || 0;
  const rows = await db.select().from(aiTradingEarningsTable)
    .where(eq(aiTradingEarningsTable.userId, req.user!.id))
    .orderBy(desc(aiTradingEarningsTable.creditedAt))
    .limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: count() }).from(aiTradingEarningsTable)
    .where(eq(aiTradingEarningsTable.userId, req.user!.id));
  res.json({
    earnings: rows.map(r => ({
      id:             r.id,
      subscriptionId: r.subscriptionId,
      planName:       r.planName,
      amountUsdt:     parseFloat(r.amountUsdt),
      creditedAt:     r.creditedAt instanceof Date ? r.creditedAt.toISOString() : r.creditedAt,
    })),
    total,
    limit,
    offset,
  });
});

router.post("/ai-trading/subscribe", requireAuth, async (req, res): Promise<void> => {
  const { planId, amount, currency } = req.body;
  if (!planId || !amount || amount <= 0) { res.status(400).json({ error: "Invalid input" }); return; }

  const [plan] = await db.select().from(aiTradingPlansTable)
    .where(and(eq(aiTradingPlansTable.id, planId), eq(aiTradingPlansTable.isActive, true)));
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const min = parseFloat(plan.minInvestment), max = parseFloat(plan.maxInvestment);
  const expiresAt = new Date(Date.now() + plan.durationDays * 86400000);
  const userId = req.user!.id;

  if (currency === "INR") {
    const inrRate   = getInrRate();
    const usdtEquiv = amount / inrRate;
    if (usdtEquiv < min || usdtEquiv > max) {
      res.status(400).json({ error: `USDT equivalent must be between $${min}–$${max} (₹${(min * inrRate).toFixed(0)}–₹${(max * inrRate).toFixed(0)})` });
      return;
    }
    const inrWallet = await getSpotWallet(userId, "INR");
    const inrAvail  = parseFloat(inrWallet?.balance ?? "0");
    if (inrAvail < amount) {
      res.status(400).json({ error: `Insufficient INR balance. Need ₹${amount.toFixed(2)}, have ₹${inrAvail.toFixed(2)}` });
      return;
    }
    await upsertSpotWallet(userId, "INR",
      String(inrAvail - amount),
      String(parseFloat(inrWallet?.locked ?? "0") + amount));

    const usdtWallet = await getSpotWallet(userId, "USDT");
    await upsertSpotWallet(userId, "USDT",
      usdtWallet?.balance ?? "0",
      String(parseFloat(usdtWallet?.locked ?? "0") + usdtEquiv));

    const [sub] = await db.insert(aiTradingSubscriptionsTable).values({
      userId, planId,
      investedAmount: String(usdtEquiv.toFixed(8)),
      expiresAt, status: "active", totalEarned: "0",
    }).returning();
    res.status(201).json(serializeSub(sub, plan));
    return;
  }

  if (amount < min || amount > max) { res.status(400).json({ error: `Amount must be between $${min} and $${max}` }); return; }
  const wallet = await getSpotWallet(userId, "USDT");
  const avail  = parseFloat(wallet?.balance ?? "0");
  if (avail < amount) { res.status(400).json({ error: "Insufficient USDT balance" }); return; }
  await upsertSpotWallet(userId, "USDT",
    String(avail - amount),
    String(parseFloat(wallet?.locked ?? "0") + amount));

  const [sub] = await db.insert(aiTradingSubscriptionsTable).values({
    userId, planId, investedAmount: String(amount),
    expiresAt, status: "active", totalEarned: "0",
  }).returning();
  res.status(201).json(serializeSub(sub, plan));
});

router.post("/ai-trading/subscriptions/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const userId = req.user!.id;
  const [sub] = await db.select().from(aiTradingSubscriptionsTable)
    .where(and(eq(aiTradingSubscriptionsTable.id, id), eq(aiTradingSubscriptionsTable.userId, userId)));
  if (!sub || sub.status !== "active") { res.status(404).json({ error: "Not found" }); return; }
  const invested = parseFloat(sub.investedAmount);
  const wallet   = await getSpotWallet(userId, "USDT");
  await upsertSpotWallet(userId, "USDT",
    String(parseFloat(wallet?.balance ?? "0") + invested),
    String(Math.max(0, parseFloat(wallet?.locked ?? "0") - invested)));
  await db.update(aiTradingSubscriptionsTable).set({ status: "cancelled" })
    .where(eq(aiTradingSubscriptionsTable.id, id));
  res.json({ success: true });
});

export default router;
