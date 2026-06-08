import { Router, type IRouter } from "express";
import { db, walletLedgerTable, coinsTable } from "@workspace/db";
import { eq, and, desc, gte, lte, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

/* ── GET /ledger ─────────────────────────────────────────────────────────── */
router.get("/ledger", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit  as string ?? "50", 10) || 50));
  const offset =                            parseInt(req.query.offset as string ?? "0",  10) || 0;

  const typeFilter:     string = String(req.query.type     ?? "");
  const coinFilter:     string = String(req.query.coin     ?? "").toUpperCase();
  const walletFilter:   string = String(req.query.wallet   ?? "");
  const fromDate:       string = String(req.query.from     ?? "");
  const toDate:         string = String(req.query.to       ?? "");

  const conditions = [eq(walletLedgerTable.userId, userId)] as any[];

  if (typeFilter)   conditions.push(eq(walletLedgerTable.type, typeFilter as any));
  if (walletFilter) conditions.push(eq(walletLedgerTable.walletType, walletFilter));
  if (fromDate)     conditions.push(gte(walletLedgerTable.createdAt, new Date(fromDate)));
  if (toDate)       conditions.push(lte(walletLedgerTable.createdAt, new Date(toDate)));

  let coinIdFilter: number | null = null;
  if (coinFilter) {
    const [coin] = await db.select({ id: coinsTable.id }).from(coinsTable)
      .where(eq(coinsTable.symbol, coinFilter)).limit(1);
    if (coin) {
      coinIdFilter = coin.id;
      conditions.push(eq(walletLedgerTable.coinId, coin.id));
    }
  }

  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  const [rows, [{ total }], coins, summaryRows] = await Promise.all([
    db.select().from(walletLedgerTable)
      .where(where)
      .orderBy(desc(walletLedgerTable.createdAt))
      .limit(limit).offset(offset),

    db.select({ total: count() }).from(walletLedgerTable).where(where),

    db.select({ id: coinsTable.id, symbol: coinsTable.symbol }).from(coinsTable),

    // Aggregated summary: total credited / debited per type
    db.select({
      type: walletLedgerTable.type,
      totalAmount: sql<string>`SUM(${walletLedgerTable.amount})`,
      txCount: count(),
    })
      .from(walletLedgerTable)
      .where(eq(walletLedgerTable.userId, userId))
      .groupBy(walletLedgerTable.type),
  ]);

  const coinById = new Map(coins.map(c => [c.id, c.symbol]));

  res.json({
    entries: rows.map(r => ({
      id:            r.id,
      type:          r.type,
      walletType:    r.walletType,
      coin:          coinById.get(r.coinId) ?? "?",
      coinId:        r.coinId,
      amount:        parseFloat(r.amount),
      balanceBefore: parseFloat(r.balanceBefore),
      balanceAfter:  parseFloat(r.balanceAfter),
      refType:       r.refType ?? null,
      refId:         r.refId   ?? null,
      note:          r.note    ?? null,
      createdAt:     r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })),
    total,
    limit,
    offset,
    summary: summaryRows.map(r => ({
      type:        r.type,
      totalAmount: parseFloat(r.totalAmount ?? "0"),
      txCount:     r.txCount,
    })),
  });
});

/* ── GET /ledger/summary ─────────────────────────────────────────────────── */
router.get("/ledger/summary", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  const [aiEarnings, totalIn, totalOut] = await Promise.all([
    db.select({ total: sql<string>`COALESCE(SUM(${walletLedgerTable.amount}), 0)`, cnt: count() })
      .from(walletLedgerTable)
      .where(and(eq(walletLedgerTable.userId, userId), eq(walletLedgerTable.type, "ai_earning"))),

    db.select({ total: sql<string>`COALESCE(SUM(${walletLedgerTable.amount}), 0)` })
      .from(walletLedgerTable)
      .where(and(
        eq(walletLedgerTable.userId, userId),
        sql`${walletLedgerTable.amount} > 0`,
      )),

    db.select({ total: sql<string>`COALESCE(SUM(${walletLedgerTable.amount}), 0)` })
      .from(walletLedgerTable)
      .where(and(
        eq(walletLedgerTable.userId, userId),
        sql`${walletLedgerTable.amount} < 0`,
      )),
  ]);

  res.json({
    totalAiEarningsUsdt: parseFloat(aiEarnings[0]?.total ?? "0"),
    aiEarningsCount:     aiEarnings[0]?.cnt ?? 0,
    totalCredited:       parseFloat(totalIn[0]?.total  ?? "0"),
    totalDebited:        Math.abs(parseFloat(totalOut[0]?.total ?? "0")),
  });
});

export default router;
