/**
 * Invoices — tax-style invoice for a filled order (Indian TDS compliance)
 * GET /api/orders/:id/invoice
 */
import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, ordersTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getInrRate } from "../lib/price-service";

const router: IRouter = Router();

const TDS_RATE    = 0.01;   // 1% India VDA TDS
const TDS_ENABLED = true;
const MAKER_FEE   = 0.001;
const TAKER_FEE   = 0.001;

router.get("/orders/:id/invoice", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, req.user!.id))).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.status !== "filled" && order.status !== "partially_filled") {
    res.status(400).json({ error: "Invoice only available for filled / partially-filled orders" }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);

  const filledQty  = parseFloat(order.filledQuantity ?? "0");
  const avgPrice   = parseFloat(order.avgFillPrice ?? order.price ?? "0");
  const grossUsdt  = filledQty * avgPrice;
  const feeRate    = order.type === "maker" ? MAKER_FEE : TAKER_FEE;
  const feeUsdt    = parseFloat(order.fee ?? String((grossUsdt * feeRate).toFixed(8)));
  const tdsUsdt    = TDS_ENABLED ? +(grossUsdt * TDS_RATE).toFixed(8) : 0;

  const netUsdt = order.side === "buy"
    ? +(grossUsdt + feeUsdt + tdsUsdt).toFixed(8)
    : +(grossUsdt - feeUsdt - tdsUsdt).toFixed(8);

  const inrRate = getInrRate();
  const toInr   = (v: number) => +(v * inrRate).toFixed(2);

  res.json({
    invoiceNo: `INV-${String(order.id).padStart(8, "0")}`,
    issuedAt:  new Date().toISOString(),
    exchange: {
      name:  "Zebvix Exchange",
      short: "ZBX",
      legal: "Zebvix Exchange — Spot Trading Tax Invoice",
      cin:   "U74999KA2020PTC123456",
      gst:   "29AAAAZ0000Z1Z1",
      address: "Bangalore, India",
    },
    user: {
      id:    user?.id,
      name:  user?.username ?? user?.email ?? "Customer",
      email: user?.email ?? "",
    },
    order: {
      id:           order.id,
      symbol:       order.symbol,
      side:         order.side,
      type:         order.type,
      status:       order.status,
      quantity:     parseFloat(order.quantity),
      filledQty,
      avgFillPrice: avgPrice,
      createdAt:    order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
    },
    charges: {
      tdsEnabled:  TDS_ENABLED,
      tdsRatePct:  TDS_RATE * 100,
      feeRatePct:  feeRate * 100,
    },
    totals: {
      grossUsdt: +grossUsdt.toFixed(8),
      feeUsdt:   +feeUsdt.toFixed(8),
      tdsUsdt,
      netUsdt,
      grossInr:  toInr(grossUsdt),
      feeInr:    toInr(feeUsdt),
      tdsInr:    toInr(tdsUsdt),
      netInr:    toInr(netUsdt),
      inrRate,
    },
    legend: order.side === "buy"
      ? "Net = Gross + Trading Fee + TDS (amount debited)"
      : "Net = Gross − Trading Fee − TDS (amount credited)",
  });
});

export default router;
