import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  TrendingUp, Bot, DollarSign, Clock, Shield, Zap, AlertTriangle,
  ChevronRight, RefreshCw, BarChart2, Cpu, Target, Flame, Sparkles,
  Calendar, ArrowUpRight, CheckCircle2,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import { Link } from "wouter";

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

const RISK_CONFIG: Record<string, { color: string; bg: string; border: string; label: string; icon: React.ReactNode; barColor: string }> = {
  low:    { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", label: "Low Risk", icon: <Shield className="w-3.5 h-3.5" />, barColor: "#10b981" },
  medium: { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   label: "Moderate", icon: <TrendingUp className="w-3.5 h-3.5" />, barColor: "#f59e0b" },
  high:   { color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30",  label: "Aggressive", icon: <Zap className="w-3.5 h-3.5" />, barColor: "#f97316" },
  ultra:  { color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30",    label: "Ultra High", icon: <Flame className="w-3.5 h-3.5" />, barColor: "#f43f5e" },
};

function daysLeft(expiresAt: string) {
  const d = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  return Math.max(0, d);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const PALETTE = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#f43f5e", "#06b6d4"];

export default function AITrading() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

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
    queryFn: () => get<{ earnings: Earning[] }>("/ai-trading/earnings?limit=30").catch(() => ({ earnings: [] })),
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const plans = plansQ.data ?? [];
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
    for (const e of earnings) {
      const d = new Date(e.creditedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      map.set(d, (map.get(d) ?? 0) + e.amountUsdt);
    }
    return Array.from(map.entries()).slice(-14).map(([date, amount]) => ({ date, amount }));
  }, [earnings]);

  const plansByRisk = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of plans) {
      map[p.riskLevel] = (map[p.riskLevel] ?? 0) + 1;
    }
    return Object.entries(map).map(([risk, count]) => ({ risk: RISK_CONFIG[risk]?.label ?? risk, count }));
  }, [plans]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <PageHeader
        eyebrow="Automated Trading"
        title="AI Trading Bots"
        description="Professional AI-powered automated strategies. Deploy capital across risk profiles and earn daily returns."
        actions={
          <Button variant="outline" size="sm" onClick={() => { plansQ.refetch(); subsQ.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        }
      />

      {/* ─── Stats ────────────────────────────────────────────────────── */}
      {user && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <PremiumStatCard
            hero
            title="Active Bots"
            value={activeSubs.length}
            icon={Bot}
            loading={subsQ.isLoading}
            hint={`${completedSubs.length} completed`}
          />
          <PremiumStatCard
            title="Total Invested"
            value={(totalInvested).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            prefix="$"
            icon={DollarSign}
            loading={subsQ.isLoading}
            hint="USDT across active bots"
          />
          <PremiumStatCard
            title="Total Earned"
            value={(totalEarned).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
            prefix="$"
            icon={TrendingUp}
            loading={subsQ.isLoading}
            hint="All-time bot earnings"
          />
          <PremiumStatCard
            title="Unrealized P&L"
            value={(unrealizedPnl >= 0 ? "+" : "") + unrealizedPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            prefix="$"
            icon={Sparkles}
            loading={subsQ.isLoading}
            hint="Current value vs invested"
          />
        </div>
      )}

      <Tabs defaultValue="plans" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="plans">
            <Cpu className="w-4 h-4 mr-1.5" />
            Bot Plans
          </TabsTrigger>
          {user && (
            <TabsTrigger value="active">
              <Bot className="w-4 h-4 mr-1.5" />
              My Bots {activeSubs.length > 0 && <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px]">{activeSubs.length}</Badge>}
            </TabsTrigger>
          )}
          {user && (
            <TabsTrigger value="earnings">
              <BarChart2 className="w-4 h-4 mr-1.5" />
              Earnings
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── Plans tab ──────────────────────────────────────────────── */}
        <TabsContent value="plans" className="space-y-4">
          {plansQ.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-64 rounded-xl bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No plans available"
              description="AI trading plans will appear here once configured by the exchange."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  onSubscribe={() => {
                    if (!user) { window.location.href = "/login"; return; }
                    setSelectedPlan(plan);
                    setSubscribeOpen(true);
                  }}
                />
              ))}
            </div>
          )}

          {/* Plan analytics mini-chart */}
          {plansByRisk.length > 0 && (
            <SectionCard title="Plans by Risk Category" icon={BarChart2} description="Distribution of available plans">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={plansByRisk} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                    <XAxis dataKey="risk" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" name="Plans" radius={[4, 4, 0, 0]}>
                      {plansByRisk.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}
        </TabsContent>

        {/* ─── My Bots tab ────────────────────────────────────────────── */}
        {user && (
          <TabsContent value="active" className="space-y-4">
            {subsQ.isLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <div key={i} className="h-40 rounded-xl bg-muted/30 animate-pulse" />)}
              </div>
            ) : subs.length === 0 ? (
              <EmptyState
                icon={Bot}
                title="No bots yet"
                description="Activate a bot from the Plans tab to start earning automated returns."
                action={<Button variant="outline" size="sm" onClick={() => {}}>Browse Plans</Button>}
              />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeSubs.map(sub => {
                    const risk = RISK_CONFIG[sub.riskLevel.toLowerCase()] ?? RISK_CONFIG.medium;
                    const left = daysLeft(sub.expiresAt);
                    const total = Math.ceil((new Date(sub.expiresAt).getTime() - new Date(sub.startedAt).getTime()) / 86_400_000);
                    const progress = total > 0 ? Math.min(100, ((total - left) / total) * 100) : 0;
                    const roi = sub.investedAmount > 0 ? ((sub.totalEarned || 0) / sub.investedAmount) * 100 : 0;
                    return (
                      <div key={sub.id} className={`rounded-xl border bg-card/50 p-5 ${risk.border} relative overflow-hidden`}>
                        <div className={`absolute top-0 left-0 right-0 h-0.5 ${risk.bg}`} style={{ background: risk.barColor }} />
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="font-bold text-foreground text-base">{sub.planName}</div>
                            <div className={`flex items-center gap-1 text-xs mt-0.5 ${risk.color}`}>
                              {risk.icon}
                              {risk.label}
                            </div>
                          </div>
                          <StatusPill status={sub.status} />
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <MetricBox label="Invested" value={`$${sub.investedAmount.toFixed(2)}`} />
                          <MetricBox label="Earned" value={`+$${(sub.totalEarned || 0).toFixed(4)}`} valueClass="text-emerald-400" />
                          <MetricBox label="Daily Return" value={`+$${sub.dailyReturn.toFixed(2)}/day`} valueClass="text-amber-400" />
                          <MetricBox label="ROI" value={`${roi.toFixed(2)}%`} valueClass={roi >= 0 ? "text-emerald-400" : "text-rose-400"} />
                        </div>

                        <div className="mb-3">
                          <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Progress</span>
                            <span>{left} days left</span>
                          </div>
                          <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${progress}%`, background: risk.barColor }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                            <span>{fmtDate(sub.startedAt)}</span>
                            <span>{fmtDate(sub.expiresAt)}</span>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs h-8"
                          onClick={() => cancelMutation.mutate(sub.id)}
                          disabled={cancelMutation.isPending}
                        >
                          Cancel & Refund
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {completedSubs.length > 0 && (
                  <SectionCard title="Completed Bots" icon={CheckCircle2} description={`${completedSubs.length} completed`} padded={false}>
                    <div className="divide-y divide-border/60">
                      {completedSubs.map(sub => {
                        const roi = sub.investedAmount > 0 ? ((sub.totalEarned || 0) / sub.investedAmount) * 100 : 0;
                        return (
                          <div key={sub.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/10 transition-colors">
                            <div>
                              <div className="text-sm font-medium">{sub.planName}</div>
                              <div className="text-[11px] text-muted-foreground">{fmtDate(sub.startedAt)} → {fmtDate(sub.expiresAt)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-mono text-emerald-400">+${(sub.totalEarned || 0).toFixed(4)}</div>
                              <div className="text-[11px] text-muted-foreground">{roi.toFixed(2)}% ROI</div>
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

        {/* ─── Earnings tab ───────────────────────────────────────────── */}
        {user && (
          <TabsContent value="earnings" className="space-y-4">
            {earningsChartData.length > 0 && (
              <SectionCard title="Daily Earnings" icon={TrendingUp} description="Last 14 days of bot credits">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={earningsChartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                      <defs>
                        <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(2)}`} width={55} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`$${Number(v).toFixed(6)} USDT`, "Earned"]} />
                      <Area type="monotone" dataKey="amount" stroke="#f59e0b" strokeWidth={2} fill="url(#earningsGrad)" dot={{ fill: "#f59e0b", r: 3 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            )}

            <SectionCard title="Earnings History" icon={BarChart2} description={`${earnings.length} credits`} padded={false}>
              {earningsQ.isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading earnings…</div>
              ) : earnings.length === 0 ? (
                <EmptyState icon={BarChart2} title="No earnings yet" description="Bot earnings will be credited daily to your wallet." />
              ) : (
                <div className="divide-y divide-border/60">
                  {earnings.map(e => (
                    <div key={e.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                          <Bot className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">{e.planName}</div>
                          <div className="text-[11px] text-muted-foreground">{fmtDate(e.creditedAt)}</div>
                        </div>
                      </div>
                      <span className={`font-mono font-semibold text-sm ${e.amountUsdt >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {e.amountUsdt >= 0 ? "+" : ""}{e.amountUsdt.toFixed(6)} USDT
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </TabsContent>
        )}
      </Tabs>

      {/* ─── Subscribe dialog ───────────────────────────────────────────── */}
      {selectedPlan && (
        <SubscribeDialog
          plan={selectedPlan}
          open={subscribeOpen}
          onClose={() => { setSubscribeOpen(false); setSelectedPlan(null); }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["ai-trading-subs"] });
          }}
        />
      )}
    </div>
  );
}

function PlanCard({ plan, onSubscribe }: { plan: Plan; onSubscribe: () => void }) {
  const risk = RISK_CONFIG[plan.riskLevel] ?? RISK_CONFIG.medium;
  const annualized = (plan.dailyReturnPercent * 365).toFixed(0);
  const totalRoi = (plan.dailyReturnPercent * plan.durationDays).toFixed(1);
  return (
    <div className={`relative rounded-xl border bg-card/50 overflow-hidden hover:border-amber-500/40 hover:-translate-y-0.5 transition-all group ${risk.border}`}>
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: risk.barColor }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="font-bold text-foreground text-base">{plan.name}</div>
            {plan.description && (
              <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{plan.description}</div>
            )}
          </div>
          <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium ${risk.color} ${risk.bg} ${risk.border}`}>
            {risk.icon}
            {risk.label}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className={`text-center p-2.5 rounded-lg ${risk.bg}`}>
            <div className={`text-lg font-bold ${risk.color}`}>{plan.dailyReturnPercent}%</div>
            <div className="text-[10px] text-muted-foreground">Daily</div>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-amber-500/10">
            <div className="text-lg font-bold text-amber-400">{annualized}%</div>
            <div className="text-[10px] text-muted-foreground">Est. APY</div>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-muted/40">
            <div className="text-lg font-bold text-foreground">{plan.durationDays}d</div>
            <div className="text-[10px] text-muted-foreground">Duration</div>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Investment range</span>
            <span className="font-mono">${plan.minInvestment} — ${plan.maxInvestment}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total ROI (est.)</span>
            <span className="font-mono text-emerald-400">+{totalRoi}%</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Active investors</span>
            <span className="font-mono">{plan.totalInvestors.toLocaleString()}</span>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>ROI Progress Bar</span>
            <span>{totalRoi}% total</span>
          </div>
          <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, parseFloat(totalRoi))}%`, background: risk.barColor }}
            />
          </div>
        </div>

        <Button
          className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold h-9"
          onClick={onSubscribe}
          disabled={!plan.isActive}
        >
          {plan.isActive ? <>Start Bot <ChevronRight className="w-4 h-4 ml-1" /></> : "Coming Soon"}
        </Button>
      </div>
    </div>
  );
}

function SubscribeDialog({
  plan, open, onClose, onSuccess,
}: {
  plan: Plan; open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USDT" | "INR">("USDT");

  const subscribeMutation = useMutation({
    mutationFn: (data: object) => post("/ai-trading/subscribe", data),
    onSuccess: () => {
      toast.success(`${plan.name} bot started! Daily earnings will be credited to your wallet.`);
      onSuccess();
      onClose();
      setAmount("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to start bot"),
  });

  const numAmt = parseFloat(amount) || 0;
  const minAmt = currency === "USDT" ? plan.minInvestment : plan.minInvestment * 83;
  const dailyProfit = numAmt * (plan.dailyReturnPercent / 100);
  const totalProfit = dailyProfit * plan.durationDays;
  const risk = RISK_CONFIG[plan.riskLevel] ?? RISK_CONFIG.medium;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Activate AI Bot — {plan.name}</DialogTitle>
          <DialogDescription>Configure your investment and start earning daily returns.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex rounded-lg overflow-hidden border border-border">
            {(["USDT", "INR"] as const).map(c => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${currency === c ? "bg-amber-500 text-black" : "text-muted-foreground hover:text-foreground"}`}
              >
                {c === "INR" ? "₹ INR" : "$ USDT"}
              </button>
            ))}
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">
              Investment Amount ({currency}) — Min: {currency === "USDT" ? `$${plan.minInvestment}` : `₹${(plan.minInvestment * 83).toFixed(0)}`}
            </Label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={String(currency === "USDT" ? plan.minInvestment : plan.minInvestment * 83)}
              className="mt-1.5"
            />
            {numAmt > 0 && numAmt < minAmt && (
              <p className="text-xs text-rose-400 mt-1">Minimum investment is {currency === "USDT" ? `$${minAmt}` : `₹${minAmt}`}</p>
            )}
          </div>

          <div className={`rounded-xl border p-4 space-y-2 ${risk.border} ${risk.bg}`}>
            <div className="flex items-center gap-1.5 text-xs font-medium mb-2" style={{ color: risk.barColor }}>
              {risk.icon}
              {risk.label} Strategy
            </div>
            <SummaryRow label="Daily return" value={`${plan.dailyReturnPercent}%`} />
            <SummaryRow label="Duration" value={`${plan.durationDays} days`} />
            {numAmt >= minAmt && numAmt > 0 && (
              <>
                <div className="border-t border-border/40 pt-2 mt-2 space-y-1.5">
                  <SummaryRow label="Est. daily profit" value={`+${dailyProfit.toFixed(4)} ${currency}`} className="text-emerald-400" />
                  <SummaryRow label="Est. total profit" value={`+${totalProfit.toFixed(4)} ${currency}`} className="text-emerald-400 font-bold" />
                  <SummaryRow label="ROI on expiry" value={`+${(plan.dailyReturnPercent * plan.durationDays).toFixed(2)}%`} className="text-amber-400" />
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={subscribeMutation.isPending}>Cancel</Button>
          <Button
            className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            onClick={() => {
              if (numAmt < minAmt) { toast.error(`Minimum investment is ${currency === "USDT" ? `$${minAmt}` : `₹${minAmt}`}`); return; }
              subscribeMutation.mutate({ planId: plan.id, amount: numAmt, currency });
            }}
            disabled={subscribeMutation.isPending || !amount || numAmt <= 0}
          >
            {subscribeMutation.isPending ? "Starting…" : "Start AI Bot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricBox({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg bg-muted/30 p-2.5">
      <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-sm font-bold font-mono ${valueClass ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

function SummaryRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${className ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}
