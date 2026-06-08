import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";
import { toast } from "sonner";
import {
  TrendingUp, Bot, DollarSign, Clock, Shield, Zap, Flame,
  ChevronRight, RefreshCw, BarChart2, Cpu, Target, Sparkles,
  Calendar, ArrowUpRight, CheckCircle2, Activity, Lock,
  Star, Users, Play, Info, Award, Layers, Infinity,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line,
} from "recharts";

interface Plan {
  id: number;
  name: string;
  description?: string;
  dailyReturnPercent: number;
  minInvestment: number;
  maxInvestment: number;
  durationDays: number;
  riskLevel: "low" | "medium" | "high" | "ultra";
  isActive: boolean;
  totalInvestors: number;
}

interface Subscription {
  id: number;
  planId: number;
  planName: string;
  riskLevel: string;
  investedAmount: number;
  currentValue: number;
  startedAt: string;
  expiresAt: string;
  status: "active" | "completed" | "cancelled";
  totalEarned: number;
  dailyReturn: number;
}

interface Earning {
  id: number;
  subscriptionId: number;
  planName: string;
  amountUsdt: number;
  creditedAt: string;
}

const RISK = {
  low: {
    label: "Low Risk", color: "#10b981", glow: "rgba(16,185,129,0.15)",
    bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400",
    gradient: "from-emerald-500/20 to-emerald-600/5",
    icon: <Shield className="w-4 h-4" />,
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  medium: {
    label: "Moderate", color: "#f59e0b", glow: "rgba(245,158,11,0.15)",
    bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400",
    gradient: "from-amber-500/20 to-amber-600/5",
    icon: <TrendingUp className="w-4 h-4" />,
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  high: {
    label: "Aggressive", color: "#f97316", glow: "rgba(249,115,22,0.15)",
    bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400",
    gradient: "from-orange-500/20 to-orange-600/5",
    icon: <Zap className="w-4 h-4" />,
    badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  },
  ultra: {
    label: "Ultra High", color: "#f43f5e", glow: "rgba(244,63,94,0.15)",
    bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400",
    gradient: "from-rose-500/20 to-rose-600/5",
    icon: <Flame className="w-4 h-4" />,
    badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  },
} as const;

type RiskKey = keyof typeof RISK;

function getRisk(key: string) {
  return RISK[(key as RiskKey)] ?? RISK.medium;
}

function daysLeft(expiresAt: string) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtUSD(n: number, dp = 2) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const start = ref.current;
    const diff = target - start;
    const steps = 30;
    const stepMs = duration / steps;
    let i = 0;
    const id = setInterval(() => {
      i++;
      const next = start + diff * (i / steps);
      setVal(next);
      if (i >= steps) { setVal(target); ref.current = target; clearInterval(id); }
    }, stepMs);
    return () => clearInterval(id);
  }, [target, duration]);
  return val;
}

function PulsingDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
    </span>
  );
}

function MiniSparkline({ color, height = 40 }: { color: string; height?: number }) {
  const data = useMemo(() => {
    let v = 100;
    return Array.from({ length: 20 }, (_, i) => {
      v = v + (Math.random() - 0.4) * 3;
      return { i, v };
    });
  }, []);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#sg-${color})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ProjectionMiniChart({ daily, days, amount, color }: { daily: number; days: number; amount: number; color: string }) {
  const data = useMemo(() => {
    return Array.from({ length: Math.min(days, 30) + 1 }, (_, i) => ({
      d: i,
      v: amount * Math.pow(1 + daily / 100, i),
    }));
  }, [daily, days, amount]);
  return (
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
        <defs>
          <linearGradient id={`pg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#pg-${color.replace("#","")})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function AITrading() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"daily" | "apy" | "investors">("daily");

  const plansQ = useQuery<Plan[]>({
    queryKey: ["ai-trading-plans"],
    queryFn: () => get<Plan[]>("/ai-trading/plans").catch(() => []),
    staleTime: 60_000,
  });

  const subsQ = useQuery<Subscription[]>({
    queryKey: ["ai-trading-subs"],
    queryFn: () => get<Subscription[]>("/ai-trading/subscriptions").catch(() => []),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const earningsQ = useQuery<{ earnings: Earning[] }>({
    queryKey: ["ai-trading-earnings"],
    queryFn: () => get<{ earnings: Earning[] }>("/ai-trading/earnings?limit=60").catch(() => ({ earnings: [] })),
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const plans = useMemo(() => {
    let list = plansQ.data ?? [];
    if (filterRisk !== "all") list = list.filter(p => p.riskLevel === filterRisk);
    if (sortBy === "daily") list = [...list].sort((a, b) => b.dailyReturnPercent - a.dailyReturnPercent);
    if (sortBy === "apy") list = [...list].sort((a, b) => (b.dailyReturnPercent * 365) - (a.dailyReturnPercent * 365));
    if (sortBy === "investors") list = [...list].sort((a, b) => (b.totalInvestors || 0) - (a.totalInvestors || 0));
    return list;
  }, [plansQ.data, filterRisk, sortBy]);

  const subs = subsQ.data ?? [];
  const earnings = earningsQ.data?.earnings ?? [];

  const activeSubs = subs.filter(s => s.status === "active");
  const completedSubs = subs.filter(s => s.status === "completed");
  const totalInvested = activeSubs.reduce((s, x) => s + x.investedAmount, 0);
  const totalEarned = subs.reduce((s, x) => s + (x.totalEarned || 0), 0);
  const totalCurrentValue = activeSubs.reduce((s, x) => s + (x.currentValue || x.investedAmount), 0);
  const unrealizedPnl = totalCurrentValue - totalInvested;

  const cancelMutation = useMutation({
    mutationFn: (id: number) => post(`/ai-trading/subscriptions/${id}/cancel`),
    onSuccess: () => {
      toast.success("Bot cancelled — investment refunded to your USDT wallet.");
      qc.invalidateQueries({ queryKey: ["ai-trading-subs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to cancel bot"),
  });

  const earningsChartData = useMemo(() => {
    const map = new Map<string, number>();
    let cumulative = 0;
    for (const e of [...earnings].reverse()) {
      const d = new Date(e.creditedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      cumulative += e.amountUsdt;
      map.set(d, cumulative);
    }
    return Array.from(map.entries()).slice(-21).map(([date, cumAmount]) => ({ date, cumAmount }));
  }, [earnings]);

  const dailyEarnings = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of earnings) {
      const d = new Date(e.creditedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      map.set(d, (map.get(d) ?? 0) + e.amountUsdt);
    }
    return Array.from(map.entries()).slice(-14).map(([date, amount]) => ({ date, amount }));
  }, [earnings]);

  const counterInvested = useCountUp(totalInvested);
  const counterEarned = useCountUp(totalEarned);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Hero Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
            <PulsingDot color="#f59e0b" />
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-widest">Live Trading</span>
          </div>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">
              AI Trading Bots
              <span className="ml-3 inline-flex items-center gap-1 text-sm font-normal text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-0.5">
                <Sparkles className="w-3.5 h-3.5" /> Powered by CryptoX AI Engine
              </span>
            </h1>
            <p className="text-muted-foreground text-sm max-w-2xl">
              Institutional-grade automated strategies. Deploy capital, earn daily returns — no trading experience required.
            </p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0"
            onClick={() => { plansQ.refetch(); subsQ.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      {user && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="col-span-2 lg:col-span-1">
            <PremiumStatCard
              hero
              title="Active Bots"
              value={activeSubs.length}
              icon={Bot}
              loading={subsQ.isLoading}
              hint={`${completedSubs.length} completed all-time`}
            />
          </div>
          <PremiumStatCard
            title="Total Invested"
            value={counterInvested.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            prefix="$"
            icon={DollarSign}
            loading={subsQ.isLoading}
            hint="USDT across active bots"
          />
          <PremiumStatCard
            title="Total Earned"
            value={counterEarned.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
            prefix="$"
            icon={TrendingUp}
            loading={subsQ.isLoading}
            hint="All-time bot earnings credited"
          />
          <PremiumStatCard
            title="Unrealized P&L"
            value={(unrealizedPnl >= 0 ? "+" : "") + unrealizedPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            prefix="$"
            icon={Sparkles}
            loading={subsQ.isLoading}
            hint="Current portfolio vs invested"
          />
        </div>
      )}

      {/* Feature pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        {[
          { icon: <Lock className="w-3.5 h-3.5" />, text: "Non-custodial" },
          { icon: <Activity className="w-3.5 h-3.5" />, text: "Daily payouts" },
          { icon: <Shield className="w-3.5 h-3.5" />, text: "Stop-loss protection" },
          { icon: <RefreshCw className="w-3.5 h-3.5" />, text: "Cancel anytime" },
          { icon: <Infinity className="w-3.5 h-3.5" />, text: "Auto-compounding" },
          { icon: <Award className="w-3.5 h-3.5" />, text: "Audited strategies" },
        ].map(f => (
          <span key={f.text} className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/40 border border-border/50 rounded-full px-3 py-1">
            {f.icon} {f.text}
          </span>
        ))}
      </div>

      <Tabs defaultValue="plans" className="space-y-6">
        <TabsList className="bg-muted h-10">
          <TabsTrigger value="plans" className="gap-1.5">
            <Cpu className="w-4 h-4" /> Bot Plans
          </TabsTrigger>
          {user && (
            <TabsTrigger value="active" className="gap-1.5">
              <Bot className="w-4 h-4" />
              My Bots
              {activeSubs.length > 0 && (
                <Badge className="ml-1 h-4 min-w-[16px] px-1 text-[10px] bg-amber-500 text-black">
                  {activeSubs.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {user && (
            <TabsTrigger value="earnings" className="gap-1.5">
              <BarChart2 className="w-4 h-4" /> Earnings
            </TabsTrigger>
          )}
        </TabsList>

        {/* ───────────────────── PLANS TAB ─────────────────────────────── */}
        <TabsContent value="plans" className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5">
              {(["all", "low", "medium", "high", "ultra"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setFilterRisk(r)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                    filterRisk === r
                      ? "bg-amber-500 text-black border-amber-500"
                      : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  {r === "all" ? "All Plans" : getRisk(r).label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              Sort:
              {(["daily", "apy", "investors"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2.5 py-1 rounded-lg border transition-all ${
                    sortBy === s ? "bg-muted text-foreground border-border" : "border-transparent hover:border-border/40"
                  }`}
                >
                  {s === "daily" ? "Daily %" : s === "apy" ? "APY" : "Popular"}
                </button>
              ))}
            </div>
          </div>

          {plansQ.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-80 rounded-2xl bg-muted/20 animate-pulse" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <EmptyState icon={Bot} title="No plans match your filter"
              description="Try selecting a different risk category." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {plans.map(plan => (
                <PlanCard key={plan.id} plan={plan} onSubscribe={() => {
                  if (!user) { window.location.href = "/login"; return; }
                  setSelectedPlan(plan);
                  setSubscribeOpen(true);
                }} />
              ))}
            </div>
          )}

          {/* How It Works */}
          <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400" />
              How AI Bots Work
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {[
                { step: "01", title: "Choose a Plan", desc: "Select a bot strategy matching your risk appetite and investment size." },
                { step: "02", title: "Deposit Capital", desc: "USDT or INR is locked into the bot's smart execution engine." },
                { step: "03", title: "AI Trades 24/7", desc: "Algorithms execute trades continuously, capturing market inefficiencies." },
                { step: "04", title: "Earn Daily", desc: "Returns are credited to your wallet every day at midnight UTC." },
              ].map(s => (
                <div key={s.step} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-amber-400">{s.step}</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{s.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ───────────────────── MY BOTS TAB ───────────────────────────── */}
        {user && (
          <TabsContent value="active" className="space-y-5">
            {subsQ.isLoading ? (
              <div className="space-y-4">
                {[1, 2].map(i => <div key={i} className="h-48 rounded-2xl bg-muted/20 animate-pulse" />)}
              </div>
            ) : subs.length === 0 ? (
              <EmptyState
                icon={Bot}
                title="No active bots"
                description="Browse plans and activate a bot to start earning automated daily returns."
                action={<Button variant="outline" size="sm">Browse Plans</Button>}
              />
            ) : (
              <>
                {activeSubs.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <PulsingDot color="#10b981" />
                      Active Bots ({activeSubs.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {activeSubs.map(sub => <BotCard key={sub.id} sub={sub} onCancel={() => cancelMutation.mutate(sub.id)} cancelling={cancelMutation.isPending} />)}
                    </div>
                  </div>
                )}

                {completedSubs.length > 0 && (
                  <SectionCard title="Completed Bots" icon={CheckCircle2}
                    description={`${completedSubs.length} completed strategies`} padded={false}>
                    <div className="divide-y divide-border/50">
                      {completedSubs.map(sub => {
                        const roi = sub.investedAmount > 0 ? ((sub.totalEarned || 0) / sub.investedAmount) * 100 : 0;
                        const risk = getRisk(sub.riskLevel.toLowerCase());
                        return (
                          <div key={sub.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/10 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: risk.glow, border: `1px solid ${risk.color}30` }}>
                                <span style={{ color: risk.color }}>{risk.icon}</span>
                              </div>
                              <div>
                                <div className="text-sm font-medium">{sub.planName}</div>
                                <div className="text-[11px] text-muted-foreground">{fmtDate(sub.startedAt)} → {fmtDate(sub.expiresAt)}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-mono font-semibold text-emerald-400">+{fmtUSD(sub.totalEarned || 0, 4)}</div>
                              <div className="text-[11px] text-muted-foreground">{roi.toFixed(2)}% ROI · {fmtUSD(sub.investedAmount)} invested</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                )}
              </>
            )}
          </TabsContent>
        )}

        {/* ───────────────────── EARNINGS TAB ──────────────────────────── */}
        {user && (
          <TabsContent value="earnings" className="space-y-5">
            {/* Cumulative chart */}
            {earningsChartData.length > 0 && (
              <SectionCard title="Cumulative Earnings" icon={TrendingUp}
                description="Total bot returns accumulated over time">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={earningsChartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}
                        tickFormatter={v => `$${v.toFixed(2)}`} width={58} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }}
                        formatter={(v: any) => [`$${Number(v).toFixed(6)} USDT`, "Cumulative"]} />
                      <Area type="monotone" dataKey="cumAmount" stroke="#10b981" strokeWidth={2}
                        fill="url(#cumGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            )}

            {/* Daily bar chart */}
            {dailyEarnings.length > 0 && (
              <SectionCard title="Daily Earnings" icon={BarChart2}
                description="Per-day bot credit breakdown (last 14 days)">
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyEarnings} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}
                        tickFormatter={v => `$${v.toFixed(4)}`} width={60} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }}
                        formatter={(v: any) => [`$${Number(v).toFixed(6)} USDT`, "Earned"]} />
                      <Bar dataKey="amount" name="Daily Earnings" radius={[4, 4, 0, 0]} fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            )}

            {/* Transaction list */}
            <SectionCard title="Earnings History" icon={Activity}
              description={`${earnings.length} total credits`} padded={false}>
              {earningsQ.isLoading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Loading earnings…</div>
              ) : earnings.length === 0 ? (
                <EmptyState icon={BarChart2} title="No earnings yet"
                  description="Bot earnings are credited daily at midnight UTC." />
              ) : (
                <div className="divide-y divide-border/50">
                  {earnings.map(e => (
                    <div key={e.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                          <Bot className="w-3.5 h-3.5 text-amber-400" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">{e.planName}</div>
                          <div className="text-[11px] text-muted-foreground">{fmtDate(e.creditedAt)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono font-semibold text-sm text-emerald-400">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        +{e.amountUsdt.toFixed(6)} USDT
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </TabsContent>
        )}
      </Tabs>

      {/* Subscribe Dialog */}
      {selectedPlan && (
        <SubscribeDialog
          plan={selectedPlan}
          open={subscribeOpen}
          onClose={() => { setSubscribeOpen(false); setSelectedPlan(null); }}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ["ai-trading-subs"] }); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────── Plan Card ──────────────────────────────────────── */
function PlanCard({ plan, onSubscribe }: { plan: Plan; onSubscribe: () => void }) {
  const risk = getRisk(plan.riskLevel);
  const annualized = (plan.dailyReturnPercent * 365).toFixed(0);
  const totalRoi = (plan.dailyReturnPercent * plan.durationDays).toFixed(1);
  const [hoveredAmt, setHoveredAmt] = useState(plan.minInvestment);
  const dailyProfit = hoveredAmt * (plan.dailyReturnPercent / 100);
  const totalProfit = dailyProfit * plan.durationDays;

  return (
    <div
      className="group relative rounded-2xl border bg-card/60 overflow-hidden transition-all duration-300 hover:-translate-y-1 flex flex-col"
      style={{
        borderColor: `${risk.color}30`,
        boxShadow: `0 0 0 0 ${risk.color}`,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 40px ${risk.glow}, 0 0 0 1px ${risk.color}40`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 0 ${risk.color}`;
      }}
    >
      {/* Top accent bar */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${risk.color}, ${risk.color}80)` }} />

      {/* Sparkline background */}
      <div className="absolute top-0 right-0 left-0 h-20 opacity-20 pointer-events-none">
        <MiniSparkline color={risk.color} height={80} />
      </div>

      <div className="p-5 flex flex-col flex-1 relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-foreground text-base leading-tight">{plan.name}</h3>
              {plan.dailyReturnPercent >= 3 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold">HOT</span>
              )}
            </div>
            {plan.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{plan.description}</p>
            )}
          </div>
          <span className={`ml-3 flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-semibold shrink-0 ${risk.badge}`}>
            {risk.icon} {risk.label}
          </span>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-3 rounded-xl" style={{ background: `${risk.color}12` }}>
            <div className="text-xl font-black" style={{ color: risk.color }}>{plan.dailyReturnPercent}%</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Daily</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-amber-500/10">
            <div className="text-xl font-black text-amber-400">{annualized}%</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Est. APY</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-muted/40">
            <div className="text-xl font-black text-foreground">{plan.durationDays}d</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Duration</div>
          </div>
        </div>

        {/* Live profit calculator */}
        <div className="mb-4 p-3.5 rounded-xl border border-border/50 bg-muted/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <Target className="w-3 h-3" /> Profit Calculator
            </span>
            <span className="text-[11px] font-mono text-foreground">${hoveredAmt.toLocaleString()}</span>
          </div>
          <Slider
            min={plan.minInvestment}
            max={Math.min(plan.maxInvestment, plan.minInvestment * 20)}
            step={plan.minInvestment}
            value={[hoveredAmt]}
            onValueChange={([v]) => setHoveredAmt(v)}
            className="mb-2.5"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-xs font-bold text-emerald-400">+${dailyProfit.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">Per day</div>
            </div>
            <div className="text-center p-2 rounded-lg" style={{ background: `${risk.color}10`, border: `1px solid ${risk.color}20` }}>
              <div className="text-xs font-bold" style={{ color: risk.color }}>+${totalProfit.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">Total profit</div>
            </div>
          </div>
          {/* Mini projection chart */}
          <div className="mt-2 -mx-1">
            <ProjectionMiniChart daily={plan.dailyReturnPercent} days={plan.durationDays} amount={hoveredAmt} color={risk.color} />
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1.5 mb-4">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Investment range</span>
            <span className="font-mono">${plan.minInvestment.toLocaleString()} — ${plan.maxInvestment.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total ROI (est.)</span>
            <span className="font-mono font-semibold text-emerald-400">+{totalRoi}%</span>
          </div>
          {(plan.totalInvestors || 0) > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Active investors</span>
              <span className="font-mono">{(plan.totalInvestors || 0).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* ROI progress bar */}
        <div className="mb-4">
          <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{
              width: `${Math.min(100, parseFloat(totalRoi))}%`,
              background: `linear-gradient(90deg, ${risk.color}, ${risk.color}99)`,
            }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>0%</span>
            <span>{totalRoi}% total return</span>
          </div>
        </div>

        <div className="mt-auto">
          <Button
            className="w-full h-10 font-bold text-sm transition-all duration-200 gap-2"
            style={plan.isActive ? { background: risk.color, color: "#000" } : {}}
            variant={plan.isActive ? "default" : "outline"}
            onClick={onSubscribe}
            disabled={!plan.isActive}
          >
            {plan.isActive ? (
              <><Play className="w-4 h-4" /> Start Bot <ChevronRight className="w-4 h-4" /></>
            ) : (
              "Coming Soon"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Bot Card ───────────────────────────────────────── */
function BotCard({ sub, onCancel, cancelling }: {
  sub: Subscription; onCancel: () => void; cancelling: boolean;
}) {
  const risk = getRisk(sub.riskLevel.toLowerCase());
  const left = daysLeft(sub.expiresAt);
  const total = Math.ceil((new Date(sub.expiresAt).getTime() - new Date(sub.startedAt).getTime()) / 86_400_000);
  const progress = total > 0 ? Math.min(100, ((total - left) / total) * 100) : 0;
  const roi = sub.investedAmount > 0 ? ((sub.totalEarned || 0) / sub.investedAmount) * 100 : 0;

  return (
    <div
      className="relative rounded-2xl border bg-card/60 overflow-hidden"
      style={{ borderColor: `${risk.color}30`, boxShadow: `0 0 24px ${risk.glow}` }}
    >
      <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${risk.color}, ${risk.color}40)` }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <PulsingDot color={risk.color} />
              <span className="font-bold text-foreground">{sub.planName}</span>
            </div>
            <div className="flex items-center gap-1 text-xs mt-1" style={{ color: risk.color }}>
              {risk.icon}
              <span>{risk.label}</span>
            </div>
          </div>
          <StatusPill status={sub.status} />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { label: "Invested", value: fmtUSD(sub.investedAmount), cls: "" },
            { label: "Earned", value: `+${fmtUSD(sub.totalEarned || 0, 4)}`, cls: "text-emerald-400" },
            { label: "Daily return", value: `+${fmtUSD(sub.dailyReturn, 2)}/day`, cls: "text-amber-400" },
            { label: "ROI", value: `${roi.toFixed(2)}%`, cls: roi >= 0 ? "text-emerald-400" : "text-rose-400" },
          ].map(m => (
            <div key={m.label} className="p-2.5 rounded-xl bg-muted/30 border border-border/40">
              <div className={`text-sm font-bold font-mono ${m.cls}`}>{m.value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Progress</span>
            <span className="font-medium">{left} days remaining</span>
          </div>
          <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${risk.color}, ${risk.color}80)` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{fmtDate(sub.startedAt)}</span>
            <span>{Math.round(progress)}% done</span>
            <span>{fmtDate(sub.expiresAt)}</span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs h-8"
          onClick={onCancel}
          disabled={cancelling}
        >
          Cancel & Refund
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────── Subscribe Dialog ───────────────────────────────── */
function SubscribeDialog({ plan, open, onClose, onSuccess }: {
  plan: Plan; open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const [amount, setAmount] = useState(String(plan.minInvestment));
  const [currency, setCurrency] = useState<"USDT" | "INR">("USDT");
  const risk = getRisk(plan.riskLevel);

  const rateQ = useQuery<{ inrRate: number }>({
    queryKey: ["inr-rate"],
    queryFn: () => get<{ inrRate: number }>("/rates"),
    staleTime: 60_000,
    enabled: open,
  });

  const subscribeMutation = useMutation({
    mutationFn: (data: object) => post("/ai-trading/subscribe", data),
    onSuccess: () => {
      toast.success(`${plan.name} bot activated! Daily earnings start tomorrow.`);
      onSuccess();
      onClose();
      setAmount(String(plan.minInvestment));
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to start bot"),
  });

  const numAmt = parseFloat(amount) || 0;
  const rate = rateQ.data?.inrRate ?? 84;
  const minAmt = currency === "USDT" ? plan.minInvestment : plan.minInvestment * rate;
  const maxAmt = currency === "USDT" ? plan.maxInvestment : plan.maxInvestment * rate;
  const amtInUsdt = currency === "USDT" ? numAmt : numAmt / rate;
  const dailyProfit = amtInUsdt * (plan.dailyReturnPercent / 100);
  const totalProfit = dailyProfit * plan.durationDays;
  const totalReturn = amtInUsdt + totalProfit;
  const roi = amtInUsdt > 0 ? (totalProfit / amtInUsdt) * 100 : 0;

  const projectionData = useMemo(() => {
    if (amtInUsdt <= 0) return [];
    return Array.from({ length: Math.min(plan.durationDays, 30) + 1 }, (_, i) => ({
      d: `D${i}`,
      v: parseFloat((amtInUsdt + amtInUsdt * (plan.dailyReturnPercent / 100) * i).toFixed(4)),
    }));
  }, [amtInUsdt, plan.dailyReturnPercent, plan.durationDays]);

  const isValid = numAmt >= minAmt && numAmt <= maxAmt;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span style={{ color: risk.color }}>{risk.icon}</span>
            Activate {plan.name}
          </DialogTitle>
          <DialogDescription>Configure your investment amount and start earning daily returns.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Currency toggle */}
          <div className="flex rounded-xl overflow-hidden border border-border">
            {(["USDT", "INR"] as const).map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
                  currency === c
                    ? "text-black"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                style={currency === c ? { background: risk.color } : {}}>
                {c === "INR" ? "₹ INR" : "$ USDT"}
              </button>
            ))}
          </div>

          {/* Amount input */}
          <div>
            <Label className="text-sm text-muted-foreground mb-1.5 block">
              Investment Amount ({currency})
              <span className="ml-2 text-xs">Min: {currency === "USDT" ? `$${plan.minInvestment.toLocaleString()}` : `₹${(plan.minInvestment * rate).toLocaleString()}`}</span>
            </Label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={String(minAmt)}
              className="h-11"
            />
            {numAmt > 0 && !isValid && (
              <p className="text-xs text-rose-400 mt-1.5">
                {numAmt < minAmt ? `Minimum: ${currency === "USDT" ? "$" : "₹"}${minAmt.toLocaleString()}` : `Maximum: ${currency === "USDT" ? "$" : "₹"}${maxAmt.toLocaleString()}`}
              </p>
            )}
          </div>

          {/* Projection */}
          {amtInUsdt > 0 && (
            <>
              <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: `${risk.color}30`, background: `${risk.color}08` }}>
                <div className="flex items-center gap-1.5 text-xs font-bold mb-1" style={{ color: risk.color }}>
                  {risk.icon} Earnings Projection
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-background/60">
                    <div className="text-sm font-bold text-emerald-400">+${dailyProfit.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">Per day</div>
                  </div>
                  <div className="p-2 rounded-lg bg-background/60">
                    <div className="text-sm font-bold text-emerald-400">+${totalProfit.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">Total profit</div>
                  </div>
                  <div className="p-2 rounded-lg bg-background/60">
                    <div className="text-sm font-bold text-foreground">${totalReturn.toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">Final value</div>
                  </div>
                </div>
                <div className="text-center">
                  <span className="text-xs text-muted-foreground">Total ROI: </span>
                  <span className="text-xs font-bold text-emerald-400">+{roi.toFixed(2)}%</span>
                  <span className="text-xs text-muted-foreground"> over {plan.durationDays} days</span>
                </div>
                {projectionData.length > 0 && (
                  <div className="h-24 -mx-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={projectionData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                        <defs>
                          <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={risk.color} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={risk.color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="v" stroke={risk.color} strokeWidth={2}
                          fill="url(#dlGrad)" dot={false} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                          formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Value"]} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Risk disclaimer */}
              <div className="flex gap-2 text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-3">
                <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Returns shown are estimates based on historical performance. Crypto markets are volatile. Past returns do not guarantee future performance. Cancel anytime for a full refund.</span>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!isValid || subscribeMutation.isPending}
            onClick={() => subscribeMutation.mutate({ planId: plan.id, amount: currency === "INR" ? numAmt : amtInUsdt, currency })}
            style={isValid ? { background: risk.color, color: "#000" } : {}}
            className="font-bold gap-2"
          >
            {subscribeMutation.isPending ? "Activating…" : <><Play className="w-4 h-4" /> Activate Bot</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
