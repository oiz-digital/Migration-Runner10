import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  ArrowDownLeft, ArrowUpRight, Bot, ArrowLeftRight, Coins, TrendingUp,
  TrendingDown, Zap, Gift, ShieldCheck, RefreshCw, ChevronLeft, ChevronRight,
  BookOpen, Info,
} from "lucide-react";
import { Link } from "wouter";

/* ── Types ─────────────────────────────────────────────────────────────── */
type LedgerEntry = {
  id: number;
  type: string;
  walletType: string;
  coin: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdAt: string;
};

type LedgerSummaryItem = { type: string; totalAmount: number; txCount: number };

type LedgerResponse = {
  entries: LedgerEntry[];
  total: number;
  limit: number;
  offset: number;
  summary: LedgerSummaryItem[];
};

type SummaryResponse = {
  totalAiEarningsUsdt: number;
  aiEarningsCount: number;
  totalCredited: number;
  totalDebited: number;
};

/* ── Helpers ───────────────────────────────────────────────────────────── */
const TYPE_META: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
  deposit_inr:           { label: "INR Deposit",        icon: <ArrowDownLeft className="h-3.5 w-3.5" />,  tone: "text-emerald-400" },
  deposit_crypto:        { label: "Crypto Deposit",     icon: <ArrowDownLeft className="h-3.5 w-3.5" />,  tone: "text-emerald-400" },
  withdrawal_inr:        { label: "INR Withdrawal",     icon: <ArrowUpRight   className="h-3.5 w-3.5" />,  tone: "text-rose-400"    },
  withdrawal_crypto:     { label: "Crypto Withdrawal",  icon: <ArrowUpRight   className="h-3.5 w-3.5" />,  tone: "text-rose-400"    },
  ai_earning:            { label: "AI Trade Earning",   icon: <Bot            className="h-3.5 w-3.5" />,  tone: "text-violet-400"  },
  ai_principal_lock:     { label: "AI Plan Invested",   icon: <Bot            className="h-3.5 w-3.5" />,  tone: "text-amber-400"   },
  ai_principal_return:   { label: "AI Plan Returned",   icon: <Bot            className="h-3.5 w-3.5" />,  tone: "text-emerald-400" },
  transfer_in:           { label: "Transfer In",        icon: <ArrowLeftRight className="h-3.5 w-3.5" />,  tone: "text-emerald-400" },
  transfer_out:          { label: "Transfer Out",       icon: <ArrowLeftRight className="h-3.5 w-3.5" />,  tone: "text-rose-400"    },
  trade_fee:             { label: "Trade Fee",          icon: <Coins          className="h-3.5 w-3.5" />,  tone: "text-rose-400"    },
  trade_buy:             { label: "Trade Buy",          icon: <TrendingUp     className="h-3.5 w-3.5" />,  tone: "text-emerald-400" },
  trade_sell:            { label: "Trade Sell",         icon: <TrendingDown   className="h-3.5 w-3.5" />,  tone: "text-rose-400"    },
  earn_deposit:          { label: "Earn Deposit",       icon: <Coins          className="h-3.5 w-3.5" />,  tone: "text-amber-400"   },
  earn_withdrawal:       { label: "Earn Withdrawal",    icon: <Coins          className="h-3.5 w-3.5" />,  tone: "text-emerald-400" },
  earn_interest:         { label: "Earn Interest",      icon: <Zap            className="h-3.5 w-3.5" />,  tone: "text-emerald-400" },
  p2p_credit:            { label: "P2P Credit",         icon: <ArrowDownLeft  className="h-3.5 w-3.5" />,  tone: "text-emerald-400" },
  p2p_debit:             { label: "P2P Debit",          icon: <ArrowUpRight   className="h-3.5 w-3.5" />,  tone: "text-rose-400"    },
  referral_bonus:        { label: "Referral Bonus",     icon: <Gift           className="h-3.5 w-3.5" />,  tone: "text-amber-400"   },
  admin_credit:          { label: "Admin Credit",       icon: <ShieldCheck    className="h-3.5 w-3.5" />,  tone: "text-emerald-400" },
  admin_debit:           { label: "Admin Debit",        icon: <ShieldCheck    className="h-3.5 w-3.5" />,  tone: "text-rose-400"    },
  convert:               { label: "Convert",            icon: <RefreshCw      className="h-3.5 w-3.5" />,  tone: "text-sky-400"     },
  options_pnl:           { label: "Options P&L",        icon: <TrendingUp     className="h-3.5 w-3.5" />,  tone: "text-violet-400"  },
  futures_pnl:           { label: "Futures P&L",        icon: <TrendingUp     className="h-3.5 w-3.5" />,  tone: "text-violet-400"  },
};

const FILTER_TYPES = [
  { value: "", label: "All types" },
  { value: "ai_earning", label: "AI Trade Earnings" },
  { value: "deposit_inr", label: "INR Deposits" },
  { value: "deposit_crypto", label: "Crypto Deposits" },
  { value: "withdrawal_inr", label: "INR Withdrawals" },
  { value: "withdrawal_crypto", label: "Crypto Withdrawals" },
  { value: "ai_principal_lock", label: "AI Plan Invested" },
  { value: "ai_principal_return", label: "AI Plan Returned" },
  { value: "transfer_in", label: "Transfer In" },
  { value: "transfer_out", label: "Transfer Out" },
  { value: "trade_buy", label: "Trade Buy" },
  { value: "trade_sell", label: "Trade Sell" },
  { value: "trade_fee", label: "Trade Fee" },
  { value: "earn_interest", label: "Earn Interest" },
  { value: "referral_bonus", label: "Referral Bonus" },
];

function fmt(n: number, coin: string) {
  if (coin === "INR") return `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  if (["USDT", "USDC"].includes(coin)) return `$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  return `${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${coin}`;
}

function fmtBal(n: number, coin: string) {
  if (coin === "INR") return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${coin}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const LIMIT = 20;

/* ── Summary cards ─────────────────────────────────────────────────────── */
function SummaryCards({ data }: { data: SummaryResponse }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {[
        {
          label: "AI Trade Earnings",
          value: `$${data.totalAiEarningsUsdt.toLocaleString("en-US", { maximumFractionDigits: 4 })}`,
          sub: `${data.aiEarningsCount} credits`,
          icon: <Bot className="h-4 w-4 text-violet-400" />,
          accent: "border-violet-400/20 bg-violet-500/5",
        },
        {
          label: "Total Credited",
          value: `$${data.totalCredited.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
          sub: "All inflows",
          icon: <ArrowDownLeft className="h-4 w-4 text-emerald-400" />,
          accent: "border-emerald-400/20 bg-emerald-500/5",
        },
        {
          label: "Total Debited",
          value: `$${data.totalDebited.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
          sub: "All outflows",
          icon: <ArrowUpRight className="h-4 w-4 text-rose-400" />,
          accent: "border-rose-400/20 bg-rose-500/5",
        },
        {
          label: "Net Balance",
          value: `$${(data.totalCredited - data.totalDebited).toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
          sub: "Credited − Debited",
          icon: <Coins className="h-4 w-4 text-amber-400" />,
          accent: "border-amber-400/20 bg-amber-500/5",
        },
      ].map((c) => (
        <div key={c.label} className={`rounded-xl border p-4 ${c.accent}`}>
          <div className="flex items-center gap-2 mb-1">
            {c.icon}
            <span className="text-xs text-muted-foreground">{c.label}</span>
          </div>
          <div className="text-xl font-bold tabular-nums">{c.value}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────── */
export default function LedgerPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");
  const [coinFilter, setCoinFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const params = new URLSearchParams({
    limit: String(LIMIT),
    offset: String(page * LIMIT),
    ...(typeFilter && { type: typeFilter }),
    ...(coinFilter && { coin: coinFilter.toUpperCase() }),
    ...(fromDate && { from: fromDate }),
    ...(toDate && { to: toDate }),
  });

  const ledgerQ = useQuery<LedgerResponse>({
    queryKey: ["ledger", page, typeFilter, coinFilter, fromDate, toDate],
    queryFn: () => get(`/ledger?${params}`),
    enabled: !!user,
  });

  const summaryQ = useQuery<SummaryResponse>({
    queryKey: ["ledger-summary"],
    queryFn: () => get("/ledger/summary"),
    enabled: !!user,
  });

  const entries = ledgerQ.data?.entries ?? [];
  const total   = ledgerQ.data?.total ?? 0;
  const pages   = Math.ceil(total / LIMIT);

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Login Required</h2>
        <p className="text-muted-foreground mb-6">Please log in to view your fund ledger</p>
        <Button asChild><Link href="/login">Login</Link></Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 md:px-6 py-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Wallet Ledger
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Complete history of every fund movement</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { ledgerQ.refetch(); summaryQ.refetch(); }}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Summary cards */}
      {summaryQ.data && <SummaryCards data={summaryQ.data} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            {FILTER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Input
          placeholder="Coin (e.g. USDT)"
          value={coinFilter}
          onChange={(e) => { setCoinFilter(e.target.value); setPage(0); }}
          className="w-32 h-8 text-xs"
        />

        <Input
          type="date"
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); setPage(0); }}
          className="w-36 h-8 text-xs"
        />
        <Input
          type="date"
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); setPage(0); }}
          className="w-36 h-8 text-xs"
        />

        {(typeFilter || coinFilter || fromDate || toDate) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setTypeFilter(""); setCoinFilter(""); setFromDate(""); setToDate(""); setPage(0); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide border-b border-border">
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Coin</th>
                <th className="px-4 py-3 text-left">Wallet</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Balance Before</th>
                <th className="px-4 py-3 text-right">Balance After</th>
                <th className="px-4 py-3 text-left">Note</th>
                <th className="px-4 py-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {ledgerQ.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-muted/40 rounded w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Info className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <div className="text-muted-foreground text-sm">
                      {typeFilter || coinFilter ? "No matching entries found" : "No ledger entries yet — fund movements will appear here"}
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((e) => {
                  const meta = TYPE_META[e.type] ?? { label: e.type, icon: <Coins className="h-3.5 w-3.5" />, tone: "text-muted-foreground" };
                  const isCredit = e.amount >= 0;
                  return (
                    <tr key={e.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={meta.tone}>{meta.icon}</span>
                          <span className="font-medium text-xs">{meta.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">{e.coin}</Badge>
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground text-xs">{e.walletType}</td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold tabular-nums text-sm ${isCredit ? "text-emerald-400" : "text-rose-400"}`}>
                        {isCredit ? "+" : "−"}{fmt(e.amount, e.coin)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
                        {fmtBal(e.balanceBefore, e.coin)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">
                        {fmtBal(e.balanceAfter, e.coin)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[140px] truncate">
                        {e.note ?? (e.refId ? `Ref: ${e.refId}` : "—")}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(e.createdAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > LIMIT && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/10 text-xs text-muted-foreground">
            <span>{total} total entries · Page {page + 1} of {pages}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
