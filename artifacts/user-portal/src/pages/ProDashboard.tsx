import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { get } from "@/lib/api";
import {
  LayoutDashboard, TrendingUp, Wallet, Bell, Activity, Star, Zap,
  AlertTriangle, ArrowUpRight, Flame, Newspaper, BarChart3, Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";

type Coin = { symbol: string; name: string; currentPrice: string | number; change24h: string | number; volume24h?: string | number };

export default function ProDashboard() {
  const { data: summary } = useQuery({
    queryKey: ["/portfolio/analytics/summary"],
    queryFn: () => get<any>("/portfolio/analytics/summary"),
    retry: false,
  });
  const { data: unread } = useQuery({
    queryKey: ["/notifications/me/unread-count"],
    queryFn: () => get<{ count: number }>("/notifications/me/unread-count"),
    retry: false,
  });
  const { data: alerts } = useQuery({
    queryKey: ["/alerts/me"],
    queryFn: () => get<{ items: any[] }>("/alerts/me"),
    retry: false,
  });
  const { data: bots } = useQuery({
    queryKey: ["/bots"],
    queryFn: () => get<{ items: any[] }>("/bots"),
    retry: false,
  });
  const { data: marketsRaw } = useQuery<any[]>({
    queryKey: ["/exchange/market"],
    queryFn: () => get<any[]>("/exchange/market"),
    staleTime: 30_000,
    retry: 1,
  });
  const coinsResp = useMemo(() => {
    const items: Coin[] = Array.isArray(marketsRaw)
      ? marketsRaw
          .filter((m) => m && typeof m.symbol === "string" && m.symbol.endsWith("/USDT"))
          .map((m) => ({
            symbol: String(m.currency ?? m.symbol.split("/")[0] ?? ""),
            name: String(m.currency ?? ""),
            currentPrice: Number(m.price ?? m.last ?? 0),
            change24h: Number(m.change ?? m.changePercent ?? 0),
            volume24h: Number(m.quoteVolume ?? m.baseVolume ?? 0),
          }))
          .filter((c) => c.symbol && Number(c.currentPrice) > 0)
      : [];
    return { items };
  }, [marketsRaw]);
  const { data: notifsResp } = useQuery({
    queryKey: ["/notifications/me?limit=5"],
    queryFn: () => get<{ items: any[] }>("/notifications/me?limit=5"),
    retry: false,
  });

  const coins = coinsResp?.items ?? [];
  const top = coins.slice(0, 12);
  const movers = [...coins].sort((a, b) => Math.abs(Number(b.change24h)) - Math.abs(Number(a.change24h))).slice(0, 6);

  const equity = summary?.totalEquityUsd ?? 0;
  const pnl24 = summary?.pnl24hUsd ?? 0;
  const pnlPct = summary?.pnl24hPct ?? 0;
  const runningBots = bots?.items?.filter((b) => b.status === "running").length ?? 0;
  const activeAlerts = alerts?.items?.filter((a) => a.status === "active").length ?? 0;

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
      <PageHeader
        eyebrow="PRO"
        title="Dashboard"
        description="Everything at a glance — portfolio, markets, bots, and alerts."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm"><Link href="/portfolio-pro">Analytics PRO</Link></Button>
            <Button asChild size="sm"><Link href="/trade">Trade now</Link></Button>
          </div>
        }
      />

      {/* Top stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PremiumStatCard
          title="Total equity"
          value={`₹${equity.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
          icon={Wallet}
          accent
        />
        <PremiumStatCard
          title="24h P&L"
          value={`${pnl24 >= 0 ? "+" : ""}₹${pnl24.toFixed(2)} · ${pnlPct.toFixed(2)}%`}
          icon={pnl24 >= 0 ? TrendingUp : TrendingUp}
          accent={pnl24 > 0}
        />
        <PremiumStatCard title="Active bots" value={String(runningBots)} icon={Activity} />
        <PremiumStatCard title="Price alerts" value={String(activeAlerts)} icon={Bell} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* LEFT 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          {/* Top movers */}
          <SectionCard
            title="Top movers (24h)"
            description="Sabse zyada hile coins."
            actions={<Button asChild variant="ghost" size="sm"><Link href="/markets">All markets <ArrowUpRight className="h-3 w-3 ml-1" /></Link></Button>}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {movers.length === 0 ? (
                <div className="col-span-full text-sm text-muted-foreground text-center py-6">No data yet.</div>
              ) : movers.map((c) => {
                const ch = Number(c.change24h);
                const px = Number(c.currentPrice);
                return (
                  <Link key={c.symbol} href={`/trade/${c.symbol}USDT`} className="rounded-lg border border-border bg-card/40 p-3 hover:border-primary/40 transition-colors">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-sm">{c.symbol}</span>
                      <span className={`text-[11px] font-mono font-bold inline-flex items-center ${ch >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {ch >= 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingUp className="h-3 w-3 mr-0.5 rotate-180" />}
                        {ch >= 0 ? "+" : ""}{ch.toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{px.toLocaleString(undefined, { maximumFractionDigits: px < 1 ? 6 : 2 })} USDT</div>
                  </Link>
                );
              })}
            </div>
          </SectionCard>

          {/* Watchlist (top 12 by default) */}
          <SectionCard
            title="Top markets"
            description="Want to pin assets? Watchlist pinning is coming soon."
            actions={<Button asChild variant="ghost" size="sm"><Link href="/markets">View all <ArrowUpRight className="h-3 w-3 ml-1" /></Link></Button>}
          >
            <div className="space-y-1">
              {top.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">No markets to show.</div>
              ) : top.map((c) => {
                const ch = Number(c.change24h);
                const px = Number(c.currentPrice);
                return (
                  <Link key={c.symbol} href={`/trade/${c.symbol}USDT`} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-7 w-7 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                        {c.symbol[0]}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">{c.symbol}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{c.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold">{px.toLocaleString(undefined, { maximumFractionDigits: px < 1 ? 6 : 2 })} USDT</div>
                      <div className={`font-mono text-[11px] ${ch >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {ch >= 0 ? "+" : ""}{ch.toFixed(2)}%
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </SectionCard>
        </div>

        {/* RIGHT 1/3 */}
        <div className="space-y-4">
          {/* Quick actions */}
          <SectionCard title="Quick actions">
            <div className="grid grid-cols-2 gap-2">
              <QuickAction href="/wallet" icon={Wallet} label="Deposit" />
              <QuickAction href="/trade" icon={TrendingUp} label="Trade" />
              <QuickAction href="/bots" icon={Zap} label="Bots" />
              <QuickAction href="/copy-trading" icon={Star} label="Copy" />
              <QuickAction href="/notifications" icon={Bell} label={`Inbox${unread?.count ? ` (${unread.count})` : ""}`} />
              <QuickAction href="/portfolio-pro" icon={BarChart3} label="Analytics" />
            </div>
          </SectionCard>

          {/* Recent notifications */}
          <SectionCard
            title="Recent activity"
            actions={<Button asChild variant="ghost" size="sm" className="h-7 text-[11px]"><Link href="/notifications">View all</Link></Button>}
          >
            {(notifsResp?.items?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">Nothing yet.</div>
            ) : (
              <div className="space-y-2">
                {notifsResp!.items.slice(0, 5).map((n: any) => (
                  <Link key={n.id} href={n.ctaUrl || "/notifications"} className="block px-2 py-1.5 rounded hover:bg-muted/30">
                    <div className="text-xs font-bold truncate">{n.title}</div>
                    {n.body && <div className="text-[11px] text-muted-foreground line-clamp-1">{n.body}</div>}
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Alerts summary */}
          <SectionCard
            title="Active alerts"
            actions={<Button asChild variant="ghost" size="sm" className="h-7 text-[11px]"><Link href="/notifications">Manage</Link></Button>}
          >
            {(alerts?.items?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No alerts. Set one!</div>
            ) : (
              <div className="space-y-1.5">
                {alerts!.items.slice(0, 5).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold">{a.coinSymbol}</span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {a.condition} {Number(a.targetPrice).toLocaleString()} USDT
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: typeof Zap; label: string }) {
  return (
    <Link href={href} className="rounded-lg border border-border bg-card/40 p-3 flex flex-col items-center gap-1 hover:border-primary/40 hover:bg-primary/5 transition-colors text-center">
      <Icon className="h-4 w-4 text-amber-400" />
      <span className="text-[11px] font-bold">{label}</span>
    </Link>
  );
}
