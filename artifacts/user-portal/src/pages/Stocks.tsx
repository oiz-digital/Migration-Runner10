import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  BarChart3, TrendingUp, TrendingDown, Search, Building2,
  Globe, RefreshCw, Info, Flag, Link2, ChevronRight,
} from "lucide-react";

type Instrument = {
  id: number; symbol: string; name: string; assetClass: string;
  exchange: string; quoteCurrency: string; currentPrice: string;
  change24h: string; high24h: string; low24h: string; volume24h: string;
  tradingEnabled: boolean; maxLeverage: number; marginRequired: string;
  takerFee: string; pricePrecision: number; sector: string | null;
  countryCode: string;
};

type Position = {
  id: number; symbol: string; name: string; side: string; qty: string;
  avgEntryPrice: number; currentPrice: number; unrealizedPnl: number;
  leverage: number; marginUsed: number; quoteCurrency: string;
  assetClass: string; createdAt: string;
};

type OrderRow = {
  id: number; symbol: string; name: string; side: string; type: string;
  qty: string; filledQty: string; avgFillPrice: string | null;
  status: string; fee: string; pnl: string; createdAt: string;
  assetClass: string; quoteCurrency: string;
};

function fmtPrice(n: number, precision = 2, currency = "INR") {
  if (!isFinite(n) || n === 0) return "—";
  const prefix = currency === "INR" ? "₹" : currency === "USD" ? "$" : "";
  return prefix + n.toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}
function fmtChange(n: number) {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

const SECTOR_COLORS: Record<string, string> = {
  Technology: "text-blue-400",
  Banking: "text-green-400",
  Finance: "text-emerald-400",
  Automobile: "text-orange-400",
  Metals: "text-gray-400",
  Conglomerate: "text-purple-400",
  Energy: "text-yellow-400",
};

export default function Stocks() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<"all" | "IN" | "US">("all");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [limitPrice, setLimitPrice] = useState("");
  const [leverage, setLeverage] = useState(1);
  const [activeTab, setActiveTab] = useState("chart");

  const { data: instrData, isLoading, refetch } = useQuery({
    queryKey: ["instruments", "stock"],
    queryFn: () => get<{ instruments: Instrument[] }>("/instruments?assetClass=stock"),
    refetchInterval: 30000,
  });

  const { data: posData } = useQuery({
    queryKey: ["instrument-positions"],
    queryFn: () => get<{ positions: Position[] }>("/instruments/positions"),
    enabled: !!user,
    refetchInterval: 15000,
  });

  const { data: orderData } = useQuery({
    queryKey: ["instrument-orders"],
    queryFn: () => get<{ orders: OrderRow[] }>("/instruments/orders"),
    enabled: !!user && activeTab === "orders",
  });

  const { data: quoteData } = useQuery({
    queryKey: ["instrument-quote", selectedSymbol],
    queryFn: () => get<{ quote: { ltp: number; open: number; high: number; low: number; changePct: number; volume: number } }>(`/instruments/${selectedSymbol}/quote`),
    enabled: !!selectedSymbol,
    refetchInterval: 10000,
  });

  const { data: brokerData } = useQuery({
    queryKey: ["broker-account"],
    queryFn: async () => {
      const r = await fetch("/api/broker/account", { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!user,
    staleTime: 60_000,
  });
  const brokerAccount = brokerData?.account;
  const brokerActive = brokerAccount?.status === "active" && !!brokerAccount?.angelClientId;
  const brokerSimulated = brokerActive && brokerAccount?.jwtToken?.startsWith("sim.");

  const instruments = instrData?.instruments ?? [];
  const positions = posData?.positions?.filter((p) => p.assetClass === "stock") ?? [];
  const orders = orderData?.orders?.filter((o) => o.assetClass === "stock") ?? [];

  const filtered = instruments.filter((i) => {
    if (country !== "all" && i.countryCode !== country) return false;
    if (search) return i.symbol.includes(search.toUpperCase()) || i.name.toUpperCase().includes(search.toUpperCase());
    return true;
  });

  const selected = instruments.find((i) => i.symbol === selectedSymbol) ?? null;
  const quote = quoteData?.quote ?? null;
  const ltp = quote?.ltp ?? (selected ? Number(selected.currentPrice) : 0);
  const changePct = quote?.changePct ?? (selected ? Number(selected.change24h) : 0);

  useEffect(() => {
    if (!selectedSymbol && instruments.length > 0) setSelectedSymbol(instruments[0].symbol);
  }, [instruments, selectedSymbol]);

  const placeMutation = useMutation({
    mutationFn: (body: object) => post("/instruments/orders", body),
    onSuccess: () => {
      toast.success(`Order placed — ${side.toUpperCase()} ${qty} shares of ${selectedSymbol}`);
      setQty(""); setLimitPrice("");
      qc.invalidateQueries({ queryKey: ["instrument-positions"] });
      qc.invalidateQueries({ queryKey: ["instrument-orders"] });
    },
    onError: (e: Error) => toast.error(e.message || "Order failed"),
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => post(`/instruments/positions/${id}/close`),
    onSuccess: () => { toast.success("Position closed"); qc.invalidateQueries({ queryKey: ["instrument-positions"] }); },
    onError: (e: Error) => toast.error(e.message || "Failed to close position"),
  });

  const handlePlace = () => {
    if (!selectedSymbol || !qty) return;
    placeMutation.mutate({
      symbol: selectedSymbol, side, qty: Number(qty), type: orderType, leverage,
      ...(orderType === "LIMIT" && limitPrice ? { price: Number(limitPrice) } : {}),
    });
  };

  const notional = ltp * Number(qty || 0);
  const marginNeeded = selected ? notional * Number(selected.marginRequired) / leverage : 0;

  const indiaStocks = instruments.filter((i) => i.countryCode === "IN");
  const usStocks = instruments.filter((i) => i.countryCode === "US");

  return (
    <div className="min-h-screen bg-[#0b0e17] text-white">
      <div className="border-b border-white/10 bg-[#0d1117] px-4 py-3 flex items-center gap-3">
        <Building2 className="w-5 h-5 text-blue-400" />
        <span className="font-bold text-lg tracking-tight">Stocks</span>
        <Badge variant="outline" className="border-blue-400/40 text-blue-400 text-[10px]">NSE · NASDAQ</Badge>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <button onClick={() => refetch()} className="hover:text-white transition-colors flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />Live</span>
        </div>
      </div>

      <div className="flex h-[calc(100vh-112px)] overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-white/10 bg-[#0d1117] flex flex-col">
          <div className="p-2 border-b border-white/10 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search stocks..."
                className="w-full bg-white/5 border border-white/10 rounded text-xs pl-7 pr-3 py-1.5 text-white placeholder-muted-foreground focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="flex gap-1">
              {(["all", "IN", "US"] as const).map((c) => (
                <button key={c} onClick={() => setCountry(c)}
                  className={cn("flex-1 text-[11px] py-1 rounded flex items-center justify-center gap-1 transition-colors",
                    country === c ? "bg-blue-500/20 text-blue-400 font-semibold" : "text-muted-foreground hover:text-white",
                  )}>
                  {c === "IN" ? "🇮🇳" : c === "US" ? "🇺🇸" : "🌐"} {c === "all" ? "All" : c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="px-3 py-2.5 border-b border-white/5">
                  <Skeleton className="h-4 w-20 mb-1" /><Skeleton className="h-3 w-28" />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">No stocks found</div>
            ) : filtered.map((inst) => {
              const chg = Number(inst.change24h);
              const isUp = chg >= 0;
              const isActive = inst.symbol === selectedSymbol;
              const currency = inst.quoteCurrency;
              return (
                <button key={inst.symbol} onClick={() => setSelectedSymbol(inst.symbol)}
                  className={cn("w-full px-3 py-2.5 border-b border-white/5 text-left hover:bg-white/5 transition-colors",
                    isActive && "bg-blue-500/10 border-l-2 border-l-blue-500")}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold">{inst.symbol}</span>
                      <span className="text-[9px] text-muted-foreground">{inst.exchange}</span>
                    </div>
                    <span className={cn("text-[12px] font-medium tabular-nums", isUp ? "text-emerald-400" : "text-red-400")}>
                      {fmtChange(chg)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[11px] text-muted-foreground truncate max-w-[110px]">{inst.name.split(" ").slice(0, 3).join(" ")}</span>
                    <span className="text-[12px] tabular-nums">{fmtPrice(Number(inst.currentPrice), 2, currency)}</span>
                  </div>
                  {inst.sector && (
                    <span className={cn("text-[9px]", SECTOR_COLORS[inst.sector] ?? "text-muted-foreground")}>{inst.sector}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected && (
            <div className="border-b border-white/10 bg-[#0d1117] px-4 py-2.5 flex items-center gap-6 flex-shrink-0 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold">{selected.symbol}</span>
                  <Badge variant="outline" className="text-[9px] border-white/20">{selected.exchange}</Badge>
                  {selected.sector && (
                    <Badge variant="outline" className={cn("text-[9px] border-white/20", SECTOR_COLORS[selected.sector ?? ""])}>{selected.sector}</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{selected.name}</div>
              </div>
              <div>
                <div className={cn("text-2xl font-bold tabular-nums", changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {fmtPrice(ltp, selected.pricePrecision, selected.quoteCurrency)}
                </div>
                <div className={cn("text-xs", changePct >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtChange(changePct)}</div>
              </div>
              <div className="text-xs space-y-0.5">
                <div className="text-muted-foreground">High <span className="text-white">{fmtPrice(Number(selected.high24h), 2, selected.quoteCurrency)}</span></div>
                <div className="text-muted-foreground">Low <span className="text-white">{fmtPrice(Number(selected.low24h), 2, selected.quoteCurrency)}</span></div>
              </div>
              <div className="text-xs space-y-0.5">
                <div className="text-muted-foreground">Volume <span className="text-white">{Number(selected.volume24h) > 0 ? Number(selected.volume24h).toLocaleString("en-IN") : "—"}</span></div>
                <div className="text-muted-foreground">Country <span className="text-white">{selected.countryCode === "IN" ? "🇮🇳 India" : "🇺🇸 USA"}</span></div>
              </div>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="border-b border-white/10 bg-transparent rounded-none px-4 flex-shrink-0 justify-start h-10">
              <TabsTrigger value="chart" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-400 rounded-none text-xs">Chart</TabsTrigger>
              <TabsTrigger value="positions" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-400 rounded-none text-xs">
                Positions {positions.length > 0 && <Badge className="ml-1 bg-blue-500/20 text-blue-400 text-[10px]">{positions.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="orders" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-400 rounded-none text-xs">Orders</TabsTrigger>
            </TabsList>

            <TabsContent value="chart" className="flex-1 overflow-auto m-0">
              <div className="h-72 bg-[#0b0e17] border-b border-white/10 flex items-center justify-center relative">
                <div className="text-center z-10">
                  <BarChart3 className="w-10 h-10 text-blue-400/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Stock Chart</p>
                  <p className="text-xs text-muted-foreground/60">Connect Angel One / Zerodha for live OHLC data</p>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-40 flex items-end gap-0.5 px-4 pb-2 opacity-15">
                  {Array.from({ length: 80 }).map((_, i) => {
                    const h = 30 + Math.random() * 60;
                    const isUp = Math.random() > 0.4;
                    return <div key={i} style={{ height: `${h}%` }} className={cn("flex-1 rounded-sm", isUp ? "bg-emerald-500" : "bg-red-500")} />;
                  })}
                </div>
              </div>
              {selected && (
                <div className="p-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="col-span-2 text-sm font-semibold text-white/80 mb-1">Instrument Details</div>
                  {[
                    ["Exchange", selected.exchange],
                    ["Quote Currency", selected.quoteCurrency],
                    ["Max Leverage", `${selected.maxLeverage}×`],
                    ["Margin Req.", `${(Number(selected.marginRequired) * 100).toFixed(0)}%`],
                    ["Taker Fee", `${(Number(selected.takerFee) * 100).toFixed(3)}%`],
                    ["Sector", selected.sector ?? "—"],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-white/5 rounded p-2.5">
                      <div className="text-muted-foreground mb-1">{label}</div>
                      <div className="font-semibold">{val}</div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="positions" className="flex-1 overflow-auto m-0 p-4">
              {!user ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Login to view positions</div>
              ) : positions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No open stock positions</div>
              ) : (
                <div className="space-y-2">
                  {positions.map((p) => {
                    const pnl = Number(p.unrealizedPnl ?? 0);
                    const isProfit = pnl >= 0;
                    return (
                      <div key={p.id} className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-center gap-4">
                        <div>
                          <div className="font-bold text-sm">{p.symbol}</div>
                          <Badge variant="outline" className={cn("text-[10px] mt-0.5", p.side === "buy" ? "border-emerald-500/40 text-emerald-400" : "border-red-500/40 text-red-400")}>
                            {p.side.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="text-xs space-y-0.5">
                          <div className="text-muted-foreground">Shares <span className="text-white">{p.qty}</span></div>
                          <div className="text-muted-foreground">Entry <span className="text-white">{fmtPrice(Number(p.avgEntryPrice), 2, p.quoteCurrency)}</span></div>
                        </div>
                        <div className="text-xs space-y-0.5">
                          <div className="text-muted-foreground">LTP <span className="text-white">{fmtPrice(Number(p.currentPrice), 2, p.quoteCurrency)}</span></div>
                          <div className="text-muted-foreground">Margin <span className="text-white">{fmtPrice(Number(p.marginUsed), 2, p.quoteCurrency)}</span></div>
                        </div>
                        <div className="ml-auto text-right">
                          <div className={cn("font-bold text-sm", isProfit ? "text-emerald-400" : "text-red-400")}>
                            {isProfit ? "+" : ""}{fmtPrice(pnl, 2, p.quoteCurrency)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Unrealized PnL</div>
                        </div>
                        <Button size="sm" variant="outline"
                          className="border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs h-7"
                          onClick={() => closeMutation.mutate(p.id)} disabled={closeMutation.isPending}>
                          Close
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="orders" className="flex-1 overflow-auto m-0 p-4">
              {!user ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Login to view orders</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No stock orders yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground">
                        <th className="text-left py-2 px-2">Symbol</th>
                        <th className="text-left py-2 px-2">Side</th>
                        <th className="text-right py-2 px-2">Qty</th>
                        <th className="text-right py-2 px-2">Avg Price</th>
                        <th className="text-left py-2 px-2">Status</th>
                        <th className="text-left py-2 px-2">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} className="border-b border-white/5">
                          <td className="py-2 px-2 font-medium">{o.symbol}</td>
                          <td className={cn("py-2 px-2 font-semibold", o.side === "buy" ? "text-emerald-400" : "text-red-400")}>{o.side.toUpperCase()}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{o.filledQty}/{o.qty}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{o.avgFillPrice ? fmtPrice(Number(o.avgFillPrice), 2, o.quoteCurrency) : "—"}</td>
                          <td className="py-2 px-2">
                            <Badge variant="outline" className={cn("text-[10px]",
                              o.status === "filled" ? "border-emerald-500/40 text-emerald-400" :
                              o.status === "rejected" ? "border-red-500/40 text-red-400" : "border-amber-500/40 text-amber-400")}>
                              {o.status}
                            </Badge>
                          </td>
                          <td className="py-2 px-2 text-muted-foreground">{new Date(o.createdAt).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Order form */}
        <div className="w-72 border-l border-white/10 bg-[#0d1117] p-4 flex flex-col gap-4 overflow-y-auto flex-shrink-0">
          <div className="text-sm font-semibold">Place Order</div>
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            <button onClick={() => setSide("buy")} className={cn("flex-1 py-2 text-sm font-semibold transition-colors", side === "buy" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:text-white")}>Buy</button>
            <button onClick={() => setSide("sell")} className={cn("flex-1 py-2 text-sm font-semibold transition-colors", side === "sell" ? "bg-red-600 text-white" : "text-muted-foreground hover:text-white")}>Sell</button>
          </div>
          <div className="flex gap-1">
            {(["MARKET", "LIMIT"] as const).map((t) => (
              <button key={t} onClick={() => setOrderType(t)}
                className={cn("flex-1 py-1 text-xs rounded transition-colors", orderType === t ? "bg-blue-500/20 text-blue-400 font-semibold" : "text-muted-foreground hover:text-white")}>
                {t}
              </button>
            ))}
          </div>
          {selected && (
            <div className="bg-white/5 rounded p-2 text-xs">
              <div className="font-bold">{selected.symbol}</div>
              <div className={cn("font-semibold", changePct >= 0 ? "text-emerald-400" : "text-red-400")}>
                {fmtPrice(ltp, 2, selected.quoteCurrency)} {fmtChange(changePct)}
              </div>
              <div className="text-muted-foreground mt-0.5">{selected.name}</div>
            </div>
          )}
          {selected && selected.maxLeverage > 1 && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Leverage: <span className="text-blue-400 font-bold">{leverage}×</span></label>
              <input type="range" min={1} max={selected.maxLeverage} value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))} className="w-full accent-blue-500" />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Quantity (shares)</label>
            <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0"
              className="bg-white/5 border-white/20 text-sm h-9" />
          </div>
          {orderType === "LIMIT" && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Limit Price</label>
              <Input type="number" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={ltp.toFixed(2)} className="bg-white/5 border-white/20 text-sm h-9" />
            </div>
          )}
          {notional > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Notional</span><span className="font-semibold">{fmtPrice(notional, 2, selected?.quoteCurrency ?? "INR")}</span></div>
              {selected && selected.maxLeverage > 1 && <div className="flex justify-between"><span className="text-muted-foreground">Margin</span><span>{fmtPrice(marginNeeded, 2, selected.quoteCurrency)}</span></div>}
            </div>
          )}
          {/* Angel One account status */}
          {user && (
            brokerActive ? (
              <div className={cn(
                "rounded-lg p-2.5 text-xs border",
                brokerSimulated
                  ? "bg-yellow-500/10 border-yellow-500/30"
                  : "bg-emerald-500/10 border-emerald-500/30",
              )}>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <Link2 className={cn("w-3 h-3", brokerSimulated ? "text-yellow-400" : "text-emerald-400")} />
                    <span className={cn("font-semibold", brokerSimulated ? "text-yellow-300" : "text-emerald-300")}>
                      {brokerSimulated ? "Simulated" : "Live"} · {brokerAccount.angelClientId}
                    </span>
                  </div>
                  <Link href="/broker/onboarding" className="text-blue-400 hover:underline text-[10px]">Manage</Link>
                </div>
                {brokerSimulated && (
                  <div className="text-yellow-500/70 mt-1 text-[10px]">
                    Add SmartAPI key for live NSE orders →&nbsp;
                    <Link href="/broker/onboarding" className="text-blue-400 underline">Setup</Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="text-xs font-semibold text-blue-300 mb-1 flex items-center gap-1.5">
                  <Link2 className="w-3 h-3" /> Connect Angel One
                </div>
                <div className="text-[11px] text-muted-foreground mb-2.5">
                  Link your Angel One demat account to trade NSE, BSE &amp; NASDAQ stocks as an Authorized Person.
                </div>
                <div className="flex gap-2">
                  <Link href="/broker/onboarding"
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold transition-colors">
                    <Link2 className="w-3 h-3" /> Connect
                  </Link>
                  <Link href="/broker/onboarding"
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-white/10 hover:bg-white/15 text-white text-xs transition-colors">
                    Open Account <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )
          )}

          {!user ? (
            <Button className="bg-blue-500 hover:bg-blue-600 text-white font-bold" asChild><a href="/login">Login to Trade</a></Button>
          ) : (
            <Button onClick={handlePlace} disabled={!selectedSymbol || !qty || placeMutation.isPending}
              className={cn("font-bold", side === "buy" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700")}>
              {placeMutation.isPending ? "Placing..." : `${side === "buy" ? "Buy" : "Sell"} ${selectedSymbol ?? ""}`}
            </Button>
          )}
          <div className="text-[10px] text-muted-foreground/60 flex items-start gap-1">
            <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>
              {brokerActive && !brokerSimulated
                ? `Live trading via Angel One · ${brokerAccount.angelClientId} · NSE/BSE`
                : "NSE/BSE stocks via Angel One AP. Connect your account for live execution."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
