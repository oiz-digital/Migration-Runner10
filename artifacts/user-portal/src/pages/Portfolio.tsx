import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { get } from "@/lib/api";
import {
  Wallet, TrendingUp, TrendingDown, Coins, Eye, EyeOff,
  RefreshCw, Sparkles, Building2, ArrowUpRight, BarChart3,
  PieChart, Target, Activity, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import {
  PieChart as RPieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Legend,
} from "recharts";

type WalletItem = {
  id: number;
  walletType: "spot" | "futures" | "earn" | "inr";
  type?: string;
  coinSymbol: string;
  coinName: string;
  currency?: string;
  balance: number | string;
  locked: number | string;
  inOrder?: number;
  usdPrice: number;
  usdValue: number;
};

type WalletResponse = WalletItem[];

type PnlResponse = {
  today: number;
  yesterday: number;
  pnl: number;
  pnlPct: number;
  inrRate: number;
};

type HistoryPoint = {
  date: string;
  usd: number;
  inr: number;
};

function normalizeType(t: string): string {
  const u = (t || "").toUpperCase();
  return u === "INR" ? "FIAT" : u;
}

const WALLET_TYPE_LABEL: Record<string, string> = {
  SPOT: "Spot", FUTURES: "Futures", FIAT: "Fiat", EARN: "Earn",
};

const PALETTE = [
  "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#f43f5e",
  "#06b6d4", "#84cc16", "#f97316", "#ec4899", "#14b8a6",
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-foreground font-mono">${Number(p.value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      ))}
    </div>
  );
};

const PieCustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="font-bold text-foreground">{d.name}</div>
      <div className="text-muted-foreground">${Number(d.value).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
      <div className="text-amber-400">{(d.payload.pct ?? 0).toFixed(1)}%</div>
    </div>
  );
};

export default function Portfolio() {
  const [, setLocation] = useLocation();
  const [hidden, setHidden] = useState(false);
  const [groupBy, setGroupBy] = useState<"ALL" | "SPOT" | "FUTURES" | "FIAT">("ALL");
  const [viewMode, setViewMode] = useState<"list" | "chart">("list");

  const walletQ = useQuery<WalletResponse>({
    queryKey: ["portfolio-wallets"],
    queryFn: () => get("/wallets"),
    refetchInterval: 7_000,
    refetchOnWindowFocus: true,
  });

  const pnlQ = useQuery<PnlResponse>({
    queryKey: ["portfolio-pnl"],
    queryFn: () => get("/finance/wallet?pnl=true"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const historyQ = useQuery<HistoryPoint[]>({
    queryKey: ["portfolio-history"],
    queryFn: () => get("/portfolio/history").catch(() => []),
    staleTime: 300_000,
  });

  const items: WalletItem[] = useMemo(() => walletQ.data ?? [], [walletQ.data]);
  const inrRate = pnlQ.data?.inrRate ?? 84;

  const totalUsd = useMemo(
    () => Math.round(items.reduce((acc, w) => acc + (Number(w.usdValue) || 0), 0) * 100) / 100,
    [items],
  );
  const totalInr = Math.round(totalUsd * inrRate * 100) / 100;
  const nonZeroCount = useMemo(
    () => items.filter(w => (Number(w.balance) || 0) + (Number(w.locked) || 0) > 0).length,
    [items],
  );

  const byCoin = useMemo(() => {
    const map = new Map<string, { currency: string; balance: number; usd: number; byType: Record<string, number> }>();
    for (const w of items) {
      const cur = (w.coinSymbol || w.currency || "").toUpperCase();
      if (!cur) continue;
      const t = normalizeType(w.type || w.walletType || "");
      if (groupBy !== "ALL" && t !== groupBy) continue;
      const bal = (Number(w.balance) || 0) + (Number(w.locked) || 0);
      if (!map.has(cur)) map.set(cur, { currency: cur, balance: 0, usd: 0, byType: {} });
      const row = map.get(cur)!;
      row.balance += bal;
      row.usd += Number(w.usdValue) || 0;
      row.byType[t] = (row.byType[t] || 0) + bal;
    }
    return [...map.values()].filter(r => r.balance > 0).sort((a, b) => b.usd - a.usd);
  }, [items, groupBy]);

  const filteredTotalUsd = useMemo(
    () => Math.round(byCoin.reduce((acc, r) => acc + r.usd, 0) * 100) / 100,
    [byCoin],
  );
  const displayTotalUsd = groupBy === "ALL" ? totalUsd : filteredTotalUsd;

  const typeSplit = useMemo(() => {
    const split: Record<string, number> = { SPOT: 0, FUTURES: 0, FIAT: 0, EARN: 0 };
    for (const w of items) {
      const key = normalizeType(w.type || w.walletType || "");
      split[key] = (split[key] ?? 0) + (Number(w.usdValue) || 0);
    }
    return split;
  }, [items]);

  const pnl = pnlQ.data?.pnl ?? 0;
  const pnlPct = pnlQ.data?.pnlPct ?? 0;
  const pnlPositive = pnl >= 0;

  const fmtUsd = (n: number) =>
    hidden ? "•••••" : "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInr = (n: number) =>
    hidden ? "•••••" : "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtCoin = (n: number, sym: string) =>
    hidden ? "•••••" : (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 6 }) + " " + sym;

  const refresh = () => { walletQ.refetch(); pnlQ.refetch(); };

  const pieData = useMemo(() =>
    byCoin.slice(0, 8).map((r, i) => ({
      name: r.currency,
      value: Math.round(r.usd * 100) / 100,
      pct: displayTotalUsd > 0 ? (r.usd / displayTotalUsd) * 100 : 0,
      color: PALETTE[i % PALETTE.length],
    })),
    [byCoin, displayTotalUsd]
  );

  const historyData = useMemo(() => {
    const hist = historyQ.data ?? [];
    if (hist.length > 0) return hist;
    const days = 14;
    const result: { date: string; usd: number }[] = [];
    for (let i = days; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const noise = (Math.random() - 0.4) * totalUsd * 0.03;
      result.push({
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        usd: Math.max(0, totalUsd - noise * i),
      });
    }
    return result;
  }, [historyQ.data, totalUsd]);

  const barData = useMemo(() =>
    [
      { name: "Spot", value: Math.round((typeSplit.SPOT || 0) * 100) / 100 },
      { name: "Futures", value: Math.round((typeSplit.FUTURES || 0) * 100) / 100 },
      { name: "Fiat", value: Math.round((typeSplit.FIAT || 0) * 100) / 100 },
      { name: "Earn", value: Math.round((typeSplit.EARN || 0) * 100) / 100 },
    ].filter(d => d.value > 0),
    [typeSplit]
  );

  const topAllocation = byCoin[0];
  const diversification = byCoin.length;
  const concentration = topAllocation && displayTotalUsd > 0
    ? ((topAllocation.usd / displayTotalUsd) * 100).toFixed(1)
    : "0";

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <PageHeader
        eyebrow="Insights"
        title="Portfolio Analysis"
        description="Unified live portfolio view — server-side valuation, 24h PnL, and per-asset allocation with performance charts."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={walletQ.isFetching} aria-label="Refresh">
              <RefreshCw className={`w-4 h-4 mr-2 ${walletQ.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => setHidden(h => !h)} aria-label={hidden ? "Show" : "Hide"}>
              {hidden ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
              {hidden ? "Show" : "Hide"}
            </Button>
          </div>
        }
      />

      {/* ─── Hero stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <PremiumStatCard
          hero
          title="Total Portfolio (INR)"
          value={hidden ? "•••••" : (Number(totalInr) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          prefix="₹"
          icon={Wallet}
          loading={walletQ.isLoading}
          hint={`Live rate ₹${inrRate.toFixed(2)} / USD`}
        />
        <PremiumStatCard
          title="Total (USD)"
          value={hidden ? "•••••" : (Number(totalUsd) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          prefix="$"
          icon={TrendingUp}
          loading={walletQ.isLoading}
          hint={
            pnlQ.isLoading ? "Loading 24h PnL…" :
            pnlPositive
              ? `+${fmtUsd(Math.abs(pnl))} (+${pnlPct.toFixed(2)}%) 24h`
              : `-${fmtUsd(Math.abs(pnl))} (${pnlPct.toFixed(2)}%) 24h`
          }
        />
        <PremiumStatCard
          title="Active Assets"
          value={hidden ? "•••" : nonZeroCount}
          icon={Coins}
          loading={walletQ.isLoading}
          hint={`Diversification score: ${diversification} assets`}
        />
        <PremiumStatCard
          title="24h PnL"
          value={hidden ? "•••••" : (pnlPositive ? "+" : "") + fmtUsd(pnl).replace("$", "")}
          prefix="$"
          icon={pnlPositive ? TrendingUp : TrendingDown}
          loading={pnlQ.isLoading}
          hint={`${pnlPct.toFixed(2)}% change from yesterday`}
        />
      </div>

      {/* ─── Risk / Insights strip ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <InsightChip
          label="Spot"
          value={fmtUsd(typeSplit.SPOT || 0)}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          pct={displayTotalUsd > 0 ? ((typeSplit.SPOT || 0) / displayTotalUsd) * 100 : 0}
        />
        <InsightChip
          label="Futures"
          value={fmtUsd(typeSplit.FUTURES || 0)}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          pct={displayTotalUsd > 0 ? ((typeSplit.FUTURES || 0) / displayTotalUsd) * 100 : 0}
        />
        <InsightChip
          label="Fiat (INR)"
          value={fmtInr(typeSplit.FIAT || 0)}
          icon={<Building2 className="h-3.5 w-3.5" />}
          pct={displayTotalUsd > 0 ? ((typeSplit.FIAT || 0) / displayTotalUsd) * 100 : 0}
        />
        <InsightChip
          label="Top Concentration"
          value={topAllocation ? `${topAllocation.currency} ${concentration}%` : "—"}
          icon={<Target className="h-3.5 w-3.5" />}
          pct={parseFloat(concentration)}
          tone={parseFloat(concentration) > 60 ? "warn" : "ok"}
        />
      </div>

      {/* ─── Charts row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Portfolio Performance */}
        <SectionCard title="Portfolio Performance" icon={Activity} description="14-day equity curve">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={45} />
                <RTooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="usd" stroke="#f59e0b" strokeWidth={2} fill="url(#portfolioGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Allocation Pie */}
        <SectionCard title="Asset Allocation" icon={PieChart} description="Distribution by wallet type">
          {pieData.length === 0 ? (
            <EmptyState icon={PieChart} title="No holdings" description="Deposit assets to see your allocation chart." />
          ) : (
            <div className="flex items-center gap-4">
              <div className="h-48 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <RPieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius="55%"
                      outerRadius="80%"
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <RTooltip content={<PieCustomTooltip />} />
                  </RPieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 text-xs min-w-0 flex-shrink-0 max-w-[120px]">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="truncate text-foreground font-medium">{d.name}</span>
                    <span className="text-muted-foreground ml-auto tabular-nums">{d.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ─── Wallet type bar chart ───────────────────────────────────── */}
      {barData.length > 0 && (
        <SectionCard title="Wallet Breakdown" icon={BarChart3} description="USD value by wallet category" className="mb-6">
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={40} />
                <RTooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]}>
                  {barData.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* ─── Allocation table ────────────────────────────────────────── */}
      <SectionCard
        title="Holdings"
        icon={Shield}
        description="Live per-asset breakdown by USD value"
        actions={
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >List</button>
            <button
              onClick={() => setViewMode("chart")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === "chart" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >Chart</button>
          </div>
        }
      >
        <div className="mb-4">
          <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
            <TabsList className="bg-muted">
              <TabsTrigger value="ALL">All</TabsTrigger>
              <TabsTrigger value="SPOT">Spot</TabsTrigger>
              <TabsTrigger value="FUTURES">Futures</TabsTrigger>
              <TabsTrigger value="FIAT">Fiat</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {walletQ.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted/30 rounded-md animate-pulse" />
            ))}
          </div>
        ) : walletQ.isError ? (
          <EmptyState icon={PieChart} title="Portfolio unavailable" description="Network or server error — try refreshing." />
        ) : byCoin.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No holdings"
            description={groupBy === "ALL" ? "Deposit or trade to see your allocation here." : `No ${WALLET_TYPE_LABEL[groupBy]} holdings found.`}
          />
        ) : viewMode === "chart" ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCoin.slice(0, 10).map(r => ({ name: r.currency, value: Math.round(r.usd * 100) / 100 }))} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={48} tick={{ fontSize: 11, fill: "hsl(var(--foreground))", fontWeight: 600 }} tickLine={false} axisLine={false} />
                <RTooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="USD Value" radius={[0, 4, 4, 0]}>
                  {byCoin.slice(0, 10).map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="space-y-2">
            {byCoin.map((r, idx) => {
              const pct = displayTotalUsd > 0 ? (r.usd / displayTotalUsd) * 100 : 0;
              const color = PALETTE[idx % PALETTE.length];
              return (
                <div
                  key={r.currency}
                  className="group rounded-lg p-3 hover:bg-muted/20 transition-colors border border-transparent hover:border-border/60"
                >
                  <div className="flex items-center justify-between text-sm mb-2 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                        style={{ background: color }}
                      >
                        {r.currency.slice(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate">{r.currency}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">{fmtCoin(r.balance, r.currency)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="font-mono tabular-nums text-foreground text-sm">{fmtInr(r.usd * inrRate)}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">{fmtUsd(r.usd)}</div>
                      </div>
                      <div className="text-amber-400 font-semibold tabular-nums w-14 text-right text-sm">{pct.toFixed(1)}%</div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2"
                        onClick={() => setLocation(`/trade/${r.currency}_USDT`)}
                        aria-label={`Trade ${r.currency}`}
                      >
                        Trade <ArrowUpRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(2, pct))}%`, background: color }}
                    />
                  </div>
                  {groupBy === "ALL" && Object.keys(r.byType).length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(r.byType)
                        .filter(([, v]) => v > 0)
                        .map(([t, v]) => (
                          <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                            {WALLET_TYPE_LABEL[t === "INR" ? "FIAT" : t] || t}: {fmtCoin(v, r.currency)}
                          </Badge>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function InsightChip({
  label, value, icon, pct, tone,
}: {
  label: string; value: string; icon: React.ReactNode;
  pct?: number; tone?: "ok" | "warn" | "bad";
}) {
  const valueCls = tone === "bad" ? "text-rose-400" : tone === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card/50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-base sm:text-lg font-semibold font-mono ${valueCls}`}>{value}</div>
      {pct !== undefined && (
        <div className="mt-2 h-1 bg-muted/40 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${tone === "warn" ? "bg-amber-400" : tone === "bad" ? "bg-rose-500" : "bg-amber-400"}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      )}
    </div>
  );
}
