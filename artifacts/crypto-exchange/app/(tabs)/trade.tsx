import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Platform, Modal, Animated, Alert
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, Line, Path, G, Text as SvgText } from "react-native-svg";
import { PanResponder } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { tradingApi, marketApi, api, settingsApi } from "@/lib/api";

interface Candle { open: number; high: number; low: number; close: number; vol: number; time: string }
interface OrderEntry { price: string; amount: string; total: string; depth: number }
interface Trade { id: string; price: string; amount: string; time: string; up: boolean }

const PAIRS = ["BTC/USDT","ETH/USDT","BNB/USDT","SOL/USDT","ADA/USDT","XRP/USDT","DOGE/USDT"];
const INTERVALS = ["1m","5m","15m","30m","1H","4H","1D","1W"];
const PAIR_BASE: Record<string, number> = {
  "BTC/USDT":64250,"ETH/USDT":3180,"BNB/USDT":580,"SOL/USDT":142,
  "ADA/USDT":0.45,"XRP/USDT":0.59,"DOGE/USDT":0.168
};
const PAIR_CHANGE: Record<string, number> = {
  "BTC/USDT":2.5,"ETH/USDT":-1.2,"BNB/USDT":5.4,"SOL/USDT":8.2,
  "ADA/USDT":-0.5,"XRP/USDT":1.8,"DOGE/USDT":3.1
};

// UI ⇄ API mappers — live data from Redis-backed endpoints, no demo generation.
const UI_TO_API_INTERVAL: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1H": "1h", "4H": "4h", "1D": "1d", "1W": "1w",
};
function fmtTime(ts: number, withSec = false): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (!withSec) return `${hh}:${mm}`;
  return `${hh}:${mm}:${String(d.getSeconds()).padStart(2, "0")}`;
}
function apiToUiCandles(raw: any[]): Candle[] {
  return (raw || []).map((c: any) => {
    const t = Number(c.time ?? c.ts ?? c.t ?? 0);
    return {
      open: Number(c.open) || 0,
      high: Number(c.high) || 0,
      low: Number(c.low) || 0,
      close: Number(c.close) || 0,
      vol: Number(c.volume ?? c.vol ?? 0),
      time: t ? fmtTime(t) : "",
    };
  });
}
function apiToUiBook(
  bidsRaw: any[],
  asksRaw: any[],
  pricePrecision: number,
  qtyPrecision: number
): { asks: OrderEntry[]; bids: OrderEntry[] } {
  const norm = (rows: any[]): [number, number][] =>
    (rows || []).map((r: any) => Array.isArray(r) ? [Number(r[0]), Number(r[1])] : [Number(r.price), Number(r.qty ?? r.amount)] as [number, number]);
  const bids = norm(bidsRaw).filter(([p, q]) => p > 0 && q > 0).slice(0, 10);
  const asks = norm(asksRaw).filter(([p, q]) => p > 0 && q > 0).slice(0, 10);
  const allQ = [...bids, ...asks].map(([, q]) => q);
  const maxQ = Math.max(1e-9, ...allQ);
  const map = ([p, q]: [number, number]): OrderEntry => ({
    price: p.toFixed(pricePrecision),
    amount: q.toFixed(qtyPrecision),
    total: (p * q).toFixed(2),
    depth: Math.min(100, (q / maxQ) * 100),
  });
  return { asks: asks.map(map).reverse(), bids: bids.map(map) };
}
function apiToUiTrades(raw: any[], pricePrecision: number, qtyPrecision: number): Trade[] {
  let prev = 0;
  return (raw || []).map((t: any, i: number) => {
    const price = Number(t.price) || 0;
    const qty = Number(t.qty ?? t.amount) || 0;
    const ts = Number(t.ts ?? t.time ?? Date.now());
    const up = t.side === "buy" || (price >= prev && prev > 0) || (i === 0 && t.side !== "sell");
    prev = price;
    return {
      id: String(t.id ?? `${ts}-${i}`),
      price: price.toFixed(pricePrecision),
      amount: qty.toFixed(qtyPrecision),
      time: fmtTime(ts, true),
      up,
    };
  });
}

function CandleChart({ candles, width, height, showMA, showBB }: {
  candles: Candle[]; width: number; height: number; showMA: boolean; showBB: boolean;
}) {
  // ---- Pan/Zoom state (X = candle count, Y = price range stretch) ----
  const MIN_VIS = 15, MAX_VIS = 400;
  const [visibleCount, setVisibleCount] = useState(60);
  const [endOffset, setEndOffset] = useState(0); // candles back from latest
  const [yZoom, setYZoom] = useState(1);          // >1 stretches price, <1 compresses
  const [yPan, setYPan] = useState(0);            // pixel offset for vertical pan
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);

  const clampVis = (n: number) => Math.max(MIN_VIS, Math.min(MAX_VIS, Math.round(n)));
  const total = candles.length;
  const clampOff = (o: number, vis: number) => Math.max(0, Math.min(o, Math.max(0, total - vis)));

  const panStart = useRef({ vis: 60, off: 0, yZoom: 1, yPan: 0, dist: 0, vDist: 0 });
  const liveRef = useRef({ visibleCount, endOffset, yZoom, yPan, candleW: 1, total: 0 });
  liveRef.current = { visibleCount, endOffset, yZoom, yPan, candleW: 1, total };

  // rAF-throttled state setters to avoid 60+ setState per second
  const rafPending = useRef(false);
  const pendingState = useRef<{ vc?: number; eo?: number; yz?: number; yp?: number }>({});
  const flushPending = () => {
    rafPending.current = false;
    const p = pendingState.current;
    pendingState.current = {};
    if (p.vc !== undefined) setVisibleCount(p.vc);
    if (p.eo !== undefined) setEndOffset(p.eo);
    if (p.yz !== undefined) setYZoom(p.yz);
    if (p.yp !== undefined) setYPan(p.yp);
  };
  const scheduleFlush = () => {
    if (rafPending.current) return;
    rafPending.current = true;
    if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(flushPending);
    else setTimeout(flushPending, 16);
  };

  const moveDistRef = useRef(0);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4 || (g.numberActiveTouches ?? 0) >= 2,
    onPanResponderGrant: (e) => {
      const cur = liveRef.current;
      panStart.current.vis = cur.visibleCount;
      panStart.current.off = cur.endOffset;
      panStart.current.yZoom = cur.yZoom;
      panStart.current.yPan = cur.yPan;
      moveDistRef.current = 0;
      const t = (e.nativeEvent as any).touches || [];
      if (t.length >= 2) {
        const dx = t[0].pageX - t[1].pageX;
        const dy = t[0].pageY - t[1].pageY;
        panStart.current.dist = Math.hypot(dx, dy) || 1;
        panStart.current.vDist = Math.abs(dy) || 1;
      }
      // Hide crosshair on new touch; will only show on stationary release
      if (liveRef.current.yZoom !== undefined) setCrosshair(null);
    },
    onPanResponderMove: (e, g) => {
      const t = (e.nativeEvent as any).touches || [];
      const cur = liveRef.current;
      moveDistRef.current = Math.max(moveDistRef.current, Math.abs(g.dx) + Math.abs(g.dy));
      if (t.length >= 2) {
        const dx = t[0].pageX - t[1].pageX;
        const dy = t[0].pageY - t[1].pageY;
        const dist = Math.hypot(dx, dy) || 1;
        const vDist = Math.abs(dy) || 1;
        if (Math.abs(dx) > Math.abs(dy)) {
          const ratio = panStart.current.dist / dist;
          pendingState.current.vc = clampVis(panStart.current.vis * ratio);
        } else {
          const ratio = vDist / panStart.current.vDist;
          pendingState.current.yz = Math.max(0.3, Math.min(5, panStart.current.yZoom * ratio));
        }
      } else {
        const dxCandles = Math.round(g.dx / Math.max(1, cur.candleW));
        pendingState.current.eo = clampOff(panStart.current.off + dxCandles, cur.visibleCount);
        pendingState.current.yp = panStart.current.yPan + g.dy;
      }
      scheduleFlush();
    },
    onPanResponderRelease: (e) => {
      // Stationary tap → show crosshair at release point
      if (moveDistRef.current < 6) {
        const lx = (e.nativeEvent as any).locationX ?? 0;
        const ly = (e.nativeEvent as any).locationY ?? 0;
        setCrosshair({ x: lx, y: ly });
        setTimeout(() => setCrosshair(null), 2500);
      }
    },
  }), []);

  // Web mouse-wheel: scroll = X zoom, shift+scroll = Y zoom
  const containerRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const target = document.querySelector('[data-trade-chart="1"]') as HTMLElement | null;
    if (!target) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      if (e.shiftKey) {
        setYZoom(z => Math.max(0.3, Math.min(5, z * factor)));
      } else {
        setVisibleCount(v => clampVis(v * factor));
      }
    };
    target.addEventListener("wheel", onWheel, { passive: false });
    return () => target.removeEventListener("wheel", onWheel);
  }, [width]);

  const reset = useCallback(() => {
    setVisibleCount(60); setEndOffset(0); setYZoom(1); setYPan(0); setCrosshair(null);
  }, []);

  // Always render container so onLayout fires; show placeholder if no data
  if (!width || !candles.length) {
    return <View style={{ width: width || "100%", height }} />;
  }

  // Layout
  const padR = 56; // right gutter for price labels
  const padB = 18; // bottom for time labels
  const volH = Math.max(34, height * 0.18);
  const gap = 4;
  const chartH = height - padB - volH - gap;
  const innerW = Math.max(40, width - padR);

  // Visible window
  const safeOff = clampOff(endOffset, visibleCount);
  const endIdx = total - safeOff;
  const startIdx = Math.max(0, endIdx - visibleCount);
  const visible = candles.slice(startIdx, endIdx);
  const candleW = innerW / Math.max(1, visible.length);
  liveRef.current.candleW = candleW;
  const bodyW = Math.max(1, candleW * 0.7);

  // Y-axis price range with zoom + pan
  const highs = visible.map(c => c.high), lows = visible.map(c => c.low);
  let maxP = Math.max(...highs), minP = Math.min(...lows);
  const mid = (maxP + minP) / 2;
  const half = ((maxP - minP) / 2) / Math.max(0.1, yZoom);
  maxP = mid + half * 1.06;
  minP = mid - half * 1.06;
  const range = maxP - minP || 1;
  const py = (v: number) => ((maxP - v) / range) * chartH + yPan;

  // Volume scale
  const maxVol = Math.max(...visible.map(c => c.vol), 1);
  const volBaseY = chartH + gap + volH;
  const volY = (v: number) => volBaseY - (v / maxVol) * volH;

  // MA20 over close
  const ma: (number | null)[] = visible.map((_, i) => {
    if (i < 19) return null;
    let s = 0;
    for (let j = i - 19; j <= i; j++) s += visible[j].close;
    return s / 20;
  });
  let maPath = "";
  ma.forEach((v, i) => {
    if (v == null) return;
    const x = i * candleW + candleW / 2;
    const y = py(v);
    maPath += (maPath ? " L" : "M") + ` ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  // Bollinger
  const bbU: (number | null)[] = [], bbL: (number | null)[] = [];
  visible.forEach((_, i) => {
    if (i < 19) { bbU.push(null); bbL.push(null); return; }
    const slice = visible.slice(i - 19, i + 1).map(c => c.close);
    const mean = slice.reduce((s, v) => s + v, 0) / 20;
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / 20);
    bbU.push(mean + 2 * std); bbL.push(mean - 2 * std);
  });
  const bbPath = (arr: (number | null)[]) => {
    let p = "";
    arr.forEach((v, i) => {
      if (v == null) return;
      const x = i * candleW + candleW / 2;
      const y = py(v);
      p += (p ? " L" : "M") + ` ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return p;
  };

  // Grid + price labels (5 lines)
  const grid = Array.from({ length: 6 }, (_, i) => {
    const p = minP + (range * (5 - i)) / 5;
    return { y: py(p), price: p };
  });

  // Time labels (5)
  const timeMarks = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const i = Math.min(visible.length - 1, Math.floor(f * (visible.length - 1)));
    return { x: i * candleW + candleW / 2, label: visible[i].time };
  });

  const last = visible[visible.length - 1];
  const lastY = py(last.close);
  const lastUp = last.close >= last.open;
  const lastColor = lastUp ? "#0ecb81" : "#f6465d";

  // Crosshair logic
  let crosshairCandle: Candle | null = null;
  let crosshairPrice = 0;
  if (crosshair && crosshair.x < innerW && crosshair.y < chartH) {
    const idx = Math.max(0, Math.min(visible.length - 1, Math.floor(crosshair.x / candleW)));
    crosshairCandle = visible[idx];
    crosshairPrice = maxP - ((crosshair.y - yPan) / chartH) * range;
  }

  const fmtP = (p: number) => p >= 1000 ? p.toFixed(0) : p >= 1 ? p.toFixed(2) : p.toFixed(5);

  return (
    <View
      ref={containerRef}
      {...({ dataSet: { tradeChart: "1" } } as any)}
      style={{ width, height }}
      {...panResponder.panHandlers}
    >
      <Svg width={width} height={height}>
        {/* Grid + price labels */}
        {grid.map((g, i) => (
          <G key={`g${i}`}>
            <Line x1={0} y1={g.y} x2={innerW} y2={g.y} stroke="#2b2f3666" strokeWidth={0.5} strokeDasharray="3 3" />
            <SvgText x={innerW + 4} y={g.y + 3} fill="#9ca3af" fontSize={9}>{fmtP(g.price)}</SvgText>
          </G>
        ))}

        {/* Volume bars */}
        {visible.map((c, i) => {
          const x = i * candleW + (candleW - bodyW) / 2;
          const isGreen = c.close >= c.open;
          const vy = volY(c.vol);
          const vh = Math.max(0.5, volBaseY - vy);
          return <Rect key={`v${i}`} x={x} y={vy} width={bodyW} height={vh} fill={(isGreen ? "#0ecb81" : "#f6465d") + "55"} />;
        })}

        {/* Bollinger bands */}
        {showBB && (
          <>
            <Path d={bbPath(bbU)} stroke="#627EEA" strokeWidth={1} fill="none" opacity={0.6} />
            <Path d={bbPath(bbL)} stroke="#627EEA" strokeWidth={1} fill="none" opacity={0.6} />
          </>
        )}

        {/* Candles */}
        {visible.map((c, i) => {
          const x = i * candleW + (candleW - bodyW) / 2;
          const cx = i * candleW + candleW / 2;
          const isGreen = c.close >= c.open;
          const col = isGreen ? "#0ecb81" : "#f6465d";
          const bodyTop = py(Math.max(c.open, c.close));
          const bodyBot = py(Math.min(c.open, c.close));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          return (
            <G key={`c${i}`}>
              <Line x1={cx} y1={py(c.high)} x2={cx} y2={bodyTop} stroke={col} strokeWidth={1} />
              <Rect x={x} y={bodyTop} width={bodyW} height={bodyH} fill={col} />
              <Line x1={cx} y1={bodyBot} x2={cx} y2={py(c.low)} stroke={col} strokeWidth={1} />
            </G>
          );
        })}

        {/* MA20 */}
        {showMA && maPath ? <Path d={maPath} stroke="#fcd535" strokeWidth={1.3} fill="none" /> : null}

        {/* Last price line */}
        <Line x1={0} y1={lastY} x2={innerW} y2={lastY} stroke={lastColor} strokeWidth={0.6} strokeDasharray="2 3" opacity={0.85} />
        <Rect x={innerW + 1} y={lastY - 7} width={padR - 2} height={14} fill={lastColor} rx={2} />
        <SvgText x={innerW + 4} y={lastY + 3} fill="#fff" fontSize={9} fontWeight="700">{fmtP(last.close)}</SvgText>

        {/* Time axis */}
        {timeMarks.map((m, i) => (
          <SvgText key={`t${i}`} x={m.x} y={height - 4} fill="#9ca3af" fontSize={8.5} textAnchor="middle">{m.label}</SvgText>
        ))}

        {/* Crosshair */}
        {crosshair && crosshairCandle && (
          <G>
            <Line x1={crosshair.x} y1={0} x2={crosshair.x} y2={chartH} stroke="#9ca3af" strokeWidth={0.5} strokeDasharray="2 2" />
            <Line x1={0} y1={crosshair.y} x2={innerW} y2={crosshair.y} stroke="#9ca3af" strokeWidth={0.5} strokeDasharray="2 2" />
            <Rect x={innerW + 1} y={crosshair.y - 7} width={padR - 2} height={14} fill="#1f2937" rx={2} />
            <SvgText x={innerW + 4} y={crosshair.y + 3} fill="#fff" fontSize={9} fontWeight="700">{fmtP(crosshairPrice)}</SvgText>
          </G>
        )}

        {/* OHLC chip header */}
        <Rect x={2} y={2} width={Math.min(innerW - 4, 290)} height={14} fill="#0b0e11cc" rx={3} />
        <SvgText x={6} y={12} fill="#e5e7eb" fontSize={9}>
          {`O ${fmtP((crosshairCandle || last).open)}  H ${fmtP((crosshairCandle || last).high)}  L ${fmtP((crosshairCandle || last).low)}  C ${fmtP((crosshairCandle || last).close)}`}
        </SvgText>
      </Svg>

      {/* Zoom controls */}
      <View style={{ position: "absolute", top: 20, right: padR + 4, flexDirection: "row", gap: 4 }}>
        <TouchableOpacity onPress={() => setVisibleCount(v => clampVis(v / 1.4))} style={chartCtrlBtn}>
          <Feather name="zoom-in" size={11} color="#e5e7eb" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setVisibleCount(v => clampVis(v * 1.4))} style={chartCtrlBtn}>
          <Feather name="zoom-out" size={11} color="#e5e7eb" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setYZoom(z => Math.min(5, z * 1.3))} style={chartCtrlBtn}>
          <Feather name="chevrons-up" size={11} color="#e5e7eb" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setYZoom(z => Math.max(0.3, z / 1.3))} style={chartCtrlBtn}>
          <Feather name="chevrons-down" size={11} color="#e5e7eb" />
        </TouchableOpacity>
        <TouchableOpacity onPress={reset} style={chartCtrlBtn}>
          <Feather name="maximize-2" size={11} color="#e5e7eb" />
        </TouchableOpacity>
      </View>

      {/* Status pill */}
      <View style={{ position: "absolute", bottom: padB + 2, left: 4, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 3, backgroundColor: "#0b0e11cc" }}>
        <Text style={{ color: "#9ca3af", fontSize: 8.5 }}>
          {visible.length}c · y{yZoom.toFixed(1)}x{safeOff > 0 ? ` · ←${safeOff}` : ""}
        </Text>
      </View>
    </View>
  );
}

const chartCtrlBtn = {
  width: 22, height: 22, borderRadius: 5,
  backgroundColor: "#1f2937cc",
  alignItems: "center" as const, justifyContent: "center" as const,
  borderWidth: 0.5, borderColor: "#2b2f36",
};

const BOTTOM_TABS = ["Open Orders","Order History","Trade History","Funds"] as const;
type BottomTab = typeof BOTTOM_TABS[number];

export default function TradeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { apiCoins, apiPairs, coins: liveCoins, user, orders: liveOrders, cancelOrder: ctxCancelOrder, refreshWallets, walletBalances, currentFeeTier, inrUsdtRate } = useApp();
  const coinById = useMemo(() => {
    const m = new Map<number, any>();
    (apiCoins || []).forEach((c: any) => m.set(c.id, c));
    return m;
  }, [apiCoins]);
  const spotPairs = useMemo(() => {
    return (apiPairs || [])
      .filter((p: any) => p.tradingEnabled !== false && p.status === "active")
      .map((p: any) => {
        const base = coinById.get(p.baseCoinId)?.symbol ?? "";
        const quote = coinById.get(p.quoteCoinId)?.symbol ?? "";
        return { ...p, label: base && quote ? `${base}/${quote}` : p.symbol };
      })
      .filter((p: any) => p.label.includes("/"));
  }, [apiPairs, coinById]);
  const livePairs = useMemo(() => {
    const arr = spotPairs.map((p: any) => p.label);
    return arr.length ? arr : PAIRS;
  }, [spotPairs]);
  const livePriceMap = useMemo(() => {
    const m: Record<string, number> = {};
    spotPairs.forEach((p: any) => { m[p.label] = Number(p.lastPrice) || 0; });
    return m;
  }, [spotPairs]);
  const liveChangeMap = useMemo(() => {
    const m: Record<string, number> = {};
    spotPairs.forEach((p: any) => { m[p.label] = Number(p.change24h) || 0; });
    return m;
  }, [spotPairs]);
  const [pair, setPair] = useState("BTC/INR");
  const [pairTouched, setPairTouched] = useState(false);
  const params = useLocalSearchParams<{ pair?: string }>();
  const queryPair = typeof params.pair === "string" ? params.pair : undefined;
  useEffect(() => {
    if (!livePairs.length) return;
    if (queryPair) {
      const q = queryPair.toUpperCase();
      const exact = livePairs.find((p: string) => p === q);
      const byBase = livePairs.find((p: string) => p.split("/")[0] === q.split("/")[0] && p.endsWith("/INR"))
        || livePairs.find((p: string) => p.split("/")[0] === q.split("/")[0]);
      const next = exact || byBase;
      if (next) { setPair(next); setPairTouched(true); return; }
    }
    if (pairTouched && livePairs.includes(pair)) return;
    const inrFirst = livePairs.find((p: string) => p.endsWith("/INR")) || livePairs[0];
    setPair(inrFirst);
  }, [livePairs, queryPair]);
  const [showPairModal, setShowPairModal] = useState(false);
  const [interval_, setInterval_] = useState("1H");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [orderBook, setOrderBook] = useState<{ asks: OrderEntry[]; bids: OrderEntry[] }>({ asks: [], bids: [] });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [currentPrice, setCurrentPrice] = useState(64250.50);
  const prevPrice = useRef(64250.50);
  const [side, setSide] = useState<"buy"|"sell">("buy");
  const [orderType, setOrderType] = useState<"limit"|"market"|"stop-limit"|"oco">("limit");
  const [tif, setTif] = useState<"GTC"|"IOC"|"FOK">("GTC");
  const [postOnly, setPostOnly] = useState(false);
  const [price, setPrice] = useState("64250.50");
  const [stopPrice, setStopPrice] = useState("");
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [pct, setPct] = useState(0);
  const [chartWidth, setChartWidth] = useState(0);
  const [showOB, setShowOB] = useState(true);
  const [showRecentTrades, setShowRecentTrades] = useState(false);
  const [showMA, setShowMA] = useState(true);
  const [showBB, setShowBB] = useState(false);
  const [showTpSl, setShowTpSl] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>("Open Orders");
  const [showTifModal, setShowTifModal] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;
  const base = pair.split("/")[0];
  const quote = pair.split("/")[1] || "USDT";
  const isInr = quote === "INR";
  const currencySym = isInr ? "₹" : "$";
  const basePrice = livePriceMap[pair] || PAIR_BASE[pair] || 64250;
  const change24h = liveChangeMap[pair] !== undefined ? liveChangeMap[pair] : (PAIR_CHANGE[pair] || 0);
  const fmtP = (v: number) => v >= 1 ? v.toLocaleString(isInr ? "en-IN" : "en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : v.toFixed(5);
  // Live pair-stats from DB (high24h/low24h/volume24h/quoteVolume24h, recomputed every 30s on backend)
  const pairSym = (base + quote).toUpperCase();
  const pairRow = useMemo(() => (apiPairs || []).find((p: any) => String(p.symbol).toUpperCase() === pairSym), [apiPairs, pairSym]);
  const fmtBig = (n: number): string => {
    if (!isFinite(n) || n <= 0) return "0";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return n.toFixed(2);
  };
  const stat24hHigh = pairRow ? Number(pairRow.high24h || 0) : 0;
  const stat24hLow = pairRow ? Number(pairRow.low24h || 0) : 0;
  const stat24hVolBase = pairRow ? Number(pairRow.volume24h || 0) : 0;
  const stat24hVolQuote = pairRow ? Number(pairRow.quoteVolume24h || 0) : 0;
  const total = price && amount ? (parseFloat(price||"0")*parseFloat(amount||"0")).toFixed(2) : "0.00";
  const priceUp = currentPrice >= prevPrice.current;

  // Precision for price/qty display, derived from quote (held in refs so polling deps stay stable)
  const pricePrec = isInr ? 2 : (basePrice >= 1 ? 2 : 5);
  const qtyPrec = basePrice >= 1000 ? 4 : (basePrice >= 1 ? 4 : 2);
  const precRef = useRef({ p: pricePrec, q: qtyPrec });
  precRef.current = { p: pricePrec, q: qtyPrec };

  // Best ask = lowest sell price (orderBook.asks is sorted ascending), Best bid = highest buy
  const bestAsk = useMemo(() => {
    const a = orderBook.asks?.[0]?.price;
    return a ? parseFloat(String(a).replace(/,/g, "")) : 0;
  }, [orderBook.asks]);
  const bestBid = useMemo(() => {
    const b = orderBook.bids?.[0]?.price;
    return b ? parseFloat(String(b).replace(/,/g, "")) : 0;
  }, [orderBook.bids]);
  const midPrice = useMemo(() => {
    if (bestAsk > 0 && bestBid > 0) return (bestAsk + bestBid) / 2;
    return 0;
  }, [bestAsk, bestBid]);

  // Drive currentPrice from WS-fed livePriceMap; reset price input on pair change
  useEffect(() => {
    if (!basePrice) return;
    prevPrice.current = currentPrice || basePrice;
    setCurrentPrice(basePrice);
  }, [basePrice]);

  // Track whether user manually edited the price input — if not, keep auto-filling with best price
  const priceTouchedRef = useRef(false);
  const onPriceChange = (v: string) => { priceTouchedRef.current = true; setPrice(v); };

  // Auto-fill price input with best ask (buy) / best bid (sell). On side change, force-refresh.
  // For limit orders only; market orders don't use price.
  useEffect(() => {
    if (orderType === "market") return;
    const target = side === "buy" ? bestAsk : bestBid;
    if (!target) return;
    // If user hasn't manually edited, always sync. If they have, only sync on side toggle.
    setPrice(target.toFixed(pricePrec));
    priceTouchedRef.current = false;
  }, [side, pair, orderType]);

  // While untouched, keep price tracking the best price as the orderbook moves
  useEffect(() => {
    if (priceTouchedRef.current) return;
    if (orderType === "market") return;
    const target = side === "buy" ? bestAsk : bestBid;
    if (!target) return;
    setPrice(target.toFixed(pricePrec));
  }, [bestAsk, bestBid]);

  // For USDT/INR pair: synthesize candles around admin-set rate (1 USDT = inrUsdtRate INR)
  const isUsdtInr = base === "USDT" && quote === "INR";
  const synthUsdtInrCandles = useCallback((rate: number): Candle[] => {
    if (!rate || rate <= 0) return [];
    const intervalMs = ({
      "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
      "1H": 3_600_000, "4H": 14_400_000, "1D": 86_400_000, "1W": 604_800_000,
    } as Record<string, number>)[interval_] || 60_000;
    const now = Date.now();
    const arr: Candle[] = [];
    // 60 candles ending at "now". Tiny ±0.05% jitter so chart doesn't look flat-dead.
    let prevClose = rate;
    for (let i = 59; i >= 0; i--) {
      const ts = now - i * intervalMs;
      const drift = (Math.sin((ts / intervalMs) * 0.7) + Math.cos((ts / intervalMs) * 1.3)) * 0.0003 * rate;
      const open = prevClose;
      const close = i === 0 ? rate : Math.max(0.0001, rate + drift);
      const hi = Math.max(open, close) * 1.0008;
      const lo = Math.min(open, close) * 0.9992;
      const d = new Date(ts);
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      arr.push({ open, high: hi, low: lo, close, vol: 1000 + Math.random() * 4000, time });
      prevClose = close;
    }
    return arr;
  }, [interval_]);

  // Initial fetch on pair/interval change: live candles + orderbook + recent trades
  useEffect(() => {
    let cancel = false;
    const sym = pair.replace("/", "").toUpperCase();
    const apiInt = UI_TO_API_INTERVAL[interval_] || "1m";

    // Special-case USDT/INR: chart driven by admin rate, no klines call needed
    if (isUsdtInr) {
      setCandles(synthUsdtInrCandles(inrUsdtRate || 84));
      // still fetch orderbook + trades (they exist for USDT/INR pair)
      (async () => {
        try {
          const [ob, tr] = await Promise.all([
            marketApi.getOrderbook(sym).catch(() => ({ bids: [], asks: [] })),
            marketApi.getTrades(sym).catch(() => []),
          ]);
          if (cancel) return;
          const { p, q } = precRef.current;
          setOrderBook(apiToUiBook(ob.bids, ob.asks, p, q));
          setTrades(apiToUiTrades(tr, p, q));
        } catch {}
      })();
      return () => { cancel = true; };
    }

    (async () => {
      try {
        const [cRes, ob, tr] = await Promise.all([
          api.get<any>(`/klines?symbol=${encodeURIComponent(sym)}&interval=${apiInt}&limit=80&source=auto`).catch(() => null),
          marketApi.getOrderbook(sym).catch(() => ({ bids: [], asks: [] })),
          marketApi.getTrades(sym).catch(() => []),
        ]);
        if (cancel) return;
        const rawCandles = (cRes?.candles ?? cRes ?? []) as any[];
        const { p, q } = precRef.current;
        setCandles(apiToUiCandles(rawCandles));
        setOrderBook(apiToUiBook(ob.bids, ob.asks, p, q));
        setTrades(apiToUiTrades(tr, p, q));
      } catch { /* keep previous */ }
    })();
    return () => { cancel = true; };
  }, [pair, interval_, isUsdtInr, inrUsdtRate, synthUsdtInrCandles]);

  // Poll Redis-backed orderbook + recent trades every 1.5s — deps only on pair so the interval is stable
  useEffect(() => {
    const sym = pair.replace("/", "").toUpperCase();
    let alive = true;
    const tick = async () => {
      try {
        const [ob, tr] = await Promise.all([
          marketApi.getOrderbook(sym),
          marketApi.getTrades(sym),
        ]);
        if (!alive) return;
        const { p, q } = precRef.current;
        setOrderBook(apiToUiBook(ob.bids, ob.asks, p, q));
        setTrades(apiToUiTrades(tr, p, q));
      } catch {}
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(id); };
  }, [pair]);

  // Live-update last candle's close/high/low from WS price ticks
  useEffect(() => {
    if (!currentPrice) return;
    setCandles(prev => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      const close = currentPrice;
      if (close === last.close) return prev;
      const updated: Candle = {
        ...last,
        close,
        high: Math.max(last.high, close),
        low: last.low > 0 ? Math.min(last.low, close) : close,
      };
      return [...prev.slice(0, -1), updated];
    });
  }, [currentPrice]);

  const spotBalance = useCallback((sym: string) => {
    const b = (walletBalances || []).find(w => w.symbol === sym && w.walletType === "spot");
    return b ? Number(b.available) || 0 : 0;
  }, [walletBalances]);
  const availBalance = side === "buy" ? spotBalance(quote) : spotBalance(base);
  const fmtBal = (v: number, dp: number) => v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

  const handlePct = useCallback((p: number) => {
    setPct(p);
    priceTouchedRef.current = true;
    const bal = side === "buy" ? spotBalance(quote) : spotBalance(base);
    const pr = parseFloat(price||"0") || currentPrice || 1;
    const dp = isInr ? 6 : 6;
    setAmount(side === "buy" ? ((bal*p/100)/pr).toFixed(dp) : (bal*p/100).toFixed(dp));
  }, [price, side, base, quote, spotBalance, currentPrice, isInr]);

  const [feeSettings, setFeeSettings] = useState<{ fee?: number; gst?: number; tds?: number }>({});
  useEffect(() => {
    let alive = true;
    settingsApi.getAll().then(s => {
      if (!alive) return;
      setFeeSettings({
        fee: s["spot.fee_percent"] ? Number(s["spot.fee_percent"]) : undefined,
        gst: s["spot.gst_percent"] ? Number(s["spot.gst_percent"]) : undefined,
        tds: s["tds.percent"] ? Number(s["tds.percent"]) : undefined,
      });
    });
    return () => { alive = false; };
  }, []);

  const totalNum = parseFloat(price||"0") * parseFloat(amount||"0");
  const qtyNum = parseFloat(amount||"0");
  const adminFeePct = feeSettings.fee ?? (orderType === "market" ? (currentFeeTier?.spotTaker ?? 0.25) : (currentFeeTier?.spotMaker ?? 0.20));
  const gstPct = feeSettings.gst ?? 18;
  const tdsPct = feeSettings.tds ?? 1;
  const feeRate = adminFeePct / 100;
  const gstRate = gstPct / 100;
  const tdsRate = tdsPct / 100;
  const feeAmt = totalNum * feeRate;            // trading fee in quote
  const gstAmt = feeAmt * gstRate;              // GST on the fee
  const tdsAmt = side === "sell" ? totalNum * tdsRate : 0; // TDS on sell value (Indian crypto reg)
  const totalDeductions = feeAmt + gstAmt + tdsAmt;
  const receiveAmt = side === "buy"
    ? qtyNum * (1 - feeRate - feeRate * gstRate)              // buyer receives qty minus fee+GST in base
    : Math.max(0, totalNum - totalDeductions);                // seller receives quote minus fee+GST+TDS

  const obRows = showOB ? 8 : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 6, borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <TouchableOpacity testID="btn-pair-selector" onPress={() => setShowPairModal(true)} style={styles.pairBtn}>
          <Text style={[styles.pairText, { color: colors.foreground }]}>{pair}</Text>
          <Feather name="chevron-down" size={13} color={colors.mutedForeground} />
        </TouchableOpacity>
        <View style={styles.priceBlock}>
          <Text style={[styles.mainPrice, { color: priceUp ? colors.success : colors.destructive }]}>{currencySym}{fmtP(currentPrice)}</Text>
          <Text style={[styles.priceChange, { color: change24h >= 0 ? colors.success : colors.destructive }]}>
            {change24h >= 0 ? "+" : ""}{change24h}% 24h
          </Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity onPress={() => setShowRecentTrades(v => !v)} style={[styles.smallBtn, { backgroundColor: showRecentTrades ? colors.primary + "22" : colors.secondary }]}>
            <Feather name="list" size={14} color={showRecentTrades ? colors.primary : colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowOB(v => !v)} style={[styles.smallBtn, { backgroundColor: showOB ? colors.primary + "22" : colors.secondary }]}>
            <Feather name="sidebar" size={14} color={showOB ? colors.primary : colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 24H Stats */}
      <View style={[styles.statsBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { l:"24H High", v: stat24hHigh > 0 ? fmtP(stat24hHigh) : "—", c: colors.success },
          { l:"24H Low",  v: stat24hLow > 0 ? fmtP(stat24hLow) : "—",  c: colors.destructive },
          { l:`24H Vol(${base})`,  v: stat24hVolBase > 0 ? fmtBig(stat24hVolBase) : "—", c: colors.foreground },
          { l:`24H Vol(${quote})`, v: stat24hVolQuote > 0 ? fmtBig(stat24hVolQuote) : "—", c: colors.foreground },
        ].map(s => (
          <View key={s.l} style={styles.statItem}>
            <Text style={[styles.statL, { color: colors.mutedForeground }]}>{s.l}</Text>
            <Text style={[styles.statV, { color: s.c }]}>{s.v}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? bottomPad + 84 : 90 }}>

        {/* Interval + Indicators */}
        <View style={[styles.intervalRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 2 }}>
            {INTERVALS.map(iv => (
              <TouchableOpacity key={iv} onPress={() => { setInterval_(iv); }}>
                <Text style={[styles.intervalTab, { color: interval_ === iv ? colors.primary : colors.mutedForeground, borderBottomColor: interval_ === iv ? colors.primary : "transparent" }]}>{iv}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.indicatorRow}>
            <TouchableOpacity onPress={() => setShowMA(v => !v)}
              style={[styles.indBtn, { backgroundColor: showMA ? "#fcd53520" : colors.secondary, borderColor: showMA ? "#fcd535" : colors.border }]}>
              <Text style={[styles.indText, { color: showMA ? "#fcd535" : colors.mutedForeground }]}>MA</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowBB(v => !v)}
              style={[styles.indBtn, { backgroundColor: showBB ? "#627EEA20" : colors.secondary, borderColor: showBB ? "#627EEA" : colors.border }]}>
              <Text style={[styles.indText, { color: showBB ? "#627EEA" : colors.mutedForeground }]}>BB</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Chart */}
        <View style={[styles.chartWrap, { backgroundColor: colors.card, minHeight: 214, position: "relative" }]}
          onLayout={e => setChartWidth(e.nativeEvent.layout.width - 8)}>
          <CandleChart candles={candles} width={chartWidth} height={210} showMA={showMA} showBB={showBB} />
          {/* Empty / loading placeholder so chart area is always visible */}
          {(!candles.length || !chartWidth) && (
            <View style={{ height: 210, alignItems: "center", justifyContent: "center" }}>
              <MaterialCommunityIcons name="chart-line" size={42} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, marginTop: 8, fontSize: 12 }}>
                Loading chart…
              </Text>
            </View>
          )}
          {/* Y-axis price labels */}
          {chartWidth > 0 && candles.length > 0 && (
            <View style={[StyleSheet.absoluteFill, { right: 0, width: 42, justifyContent:"space-between", paddingVertical: 2 }]} pointerEvents="none">
              {[0,1,2,3,4].map(i => {
                const ps = candles.flatMap(c => [c.high, c.low]);
                const mn = Math.min(...ps), mx = Math.max(...ps);
                const v = mx - (i/4)*(mx-mn);
                return <Text key={i} style={[styles.yLabel,{color:colors.mutedForeground,textAlign:"right"}]}>
                  {v>=1000?`${(v/1000).toFixed(1)}k`:v.toFixed(basePrice<1?4:1)}
                </Text>;
              })}
            </View>
          )}
        </View>

        {/* Order book + Trades + Form */}
        <View style={styles.mainRow}>
          {/* Left: Order Book or Recent Trades */}
          {(showOB || showRecentTrades) && (
            <View style={[styles.leftPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Header tabs */}
              <View style={styles.obTabRow}>
                {showOB && (
                  <TouchableOpacity onPress={() => setShowRecentTrades(false)}
                    style={[styles.obTab, { borderBottomColor: !showRecentTrades ? colors.primary : "transparent" }]}>
                    <Text style={[styles.obTabText, { color: !showRecentTrades ? colors.primary : colors.mutedForeground }]}>OB</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowRecentTrades(true)}
                  style={[styles.obTab, { borderBottomColor: showRecentTrades ? colors.primary : "transparent" }]}>
                  <Text style={[styles.obTabText, { color: showRecentTrades ? colors.primary : colors.mutedForeground }]}>Trades</Text>
                </TouchableOpacity>
              </View>

              {!showRecentTrades ? (
                <>
                  {/* OB column headers */}
                  <View style={styles.obColRow}>
                    <Text style={[styles.obColText, { color: colors.mutedForeground }]}>Price</Text>
                    <Text style={[styles.obColText, { color: colors.mutedForeground, textAlign:"right" }]}>Qty</Text>
                  </View>
                  {(() => {
                    const realAsks = orderBook.asks.slice(0, obRows);
                    const padded = [
                      ...Array.from({ length: Math.max(0, obRows - realAsks.length) }, () => null as any),
                      ...[...realAsks].reverse(),
                    ];
                    return padded.map((a, i) =>
                      a ? (
                        <TouchableOpacity key={`ask${i}`} style={styles.obRow}
                          onPress={() => { priceTouchedRef.current = true; setPrice(String(a.price).replace(/,/g, "")); Haptics.selectionAsync(); }}>
                          <View style={[styles.obBar, { right: 0, backgroundColor: "#f6465d0e", width: `${a.depth * 0.7}%` as any }]} />
                          <Text style={[styles.obPrice, { color: colors.destructive }]}>{a.price}</Text>
                          <Text style={[styles.obAmt, { color: colors.mutedForeground }]}>{a.amount}</Text>
                        </TouchableOpacity>
                      ) : (
                        <View key={`ask-empty${i}`} style={styles.obRow}>
                          <Text style={[styles.obPrice, { color: colors.mutedForeground, opacity: 0.4 }]}>—</Text>
                          <Text style={[styles.obAmt, { color: colors.mutedForeground, opacity: 0.4 }]}>No order</Text>
                        </View>
                      )
                    );
                  })()}
                  <View style={[styles.spreadRow, { backgroundColor: colors.secondary, justifyContent: "space-between", paddingHorizontal: 6 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={[styles.spreadP, { color: priceUp ? colors.success : colors.destructive }]}>{fmtP(currentPrice)}</Text>
                      <Feather name={priceUp ? "arrow-up" : "arrow-down"} size={9} color={priceUp ? colors.success : colors.destructive} />
                    </View>
                    {midPrice > 0 && (
                      <TouchableOpacity onPress={() => { priceTouchedRef.current = true; setPrice(midPrice.toFixed(pricePrec)); Haptics.selectionAsync(); }}>
                        <Text style={{ fontSize: 9, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>
                          Mid {midPrice.toFixed(pricePrec)}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {(() => {
                    const realBids = orderBook.bids.slice(0, obRows);
                    const padded = [
                      ...realBids,
                      ...Array.from({ length: Math.max(0, obRows - realBids.length) }, () => null as any),
                    ];
                    return padded.map((b, i) =>
                      b ? (
                        <TouchableOpacity key={`bid${i}`} style={styles.obRow}
                          onPress={() => { priceTouchedRef.current = true; setPrice(String(b.price).replace(/,/g, "")); Haptics.selectionAsync(); }}>
                          <View style={[styles.obBar, { right: 0, backgroundColor: "#0ecb810e", width: `${b.depth * 0.7}%` as any }]} />
                          <Text style={[styles.obPrice, { color: colors.success }]}>{b.price}</Text>
                          <Text style={[styles.obAmt, { color: colors.mutedForeground }]}>{b.amount}</Text>
                        </TouchableOpacity>
                      ) : (
                        <View key={`bid-empty${i}`} style={styles.obRow}>
                          <Text style={[styles.obPrice, { color: colors.mutedForeground, opacity: 0.4 }]}>—</Text>
                          <Text style={[styles.obAmt, { color: colors.mutedForeground, opacity: 0.4 }]}>No order</Text>
                        </View>
                      )
                    );
                  })()}
                </>
              ) : (
                <>
                  <View style={styles.obColRow}>
                    <Text style={[styles.obColText, { color: colors.mutedForeground }]}>Price</Text>
                    <Text style={[styles.obColText, { color: colors.mutedForeground, textAlign:"right" }]}>Amt</Text>
                  </View>
                  {trades.slice(0, 18).map(t => (
                    <View key={t.id} style={styles.obRow}>
                      <Text style={[styles.obPrice, { color: t.up ? colors.success : colors.destructive }]}>{t.price}</Text>
                      <Text style={[styles.obAmt, { color: colors.mutedForeground }]}>{t.amount}</Text>
                    </View>
                  ))}
                  {trades.length < 18 && [...Array(18 - trades.length)].map((_, i) => (
                    <View key={`pt${i}`} style={styles.obRow}>
                      <Text style={[styles.obPrice, { color: i % 2 === 0 ? colors.success : colors.destructive, opacity: 0.3 }]}>— — —</Text>
                      <Text style={[styles.obAmt, { color: colors.mutedForeground, opacity: 0.3 }]}>— — —</Text>
                    </View>
                  ))}
                  {trades.length === 0 && (
                    <View style={{ alignItems: "center", paddingVertical: 6 }}>
                      <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>Waiting for trades...</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {/* Order Form */}
          <View style={[styles.orderForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {!user ? (
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 18, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={28} color={colors.primary} />
              </View>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.foreground, textAlign: "center" }}>Login to Trade</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, textAlign: "center", lineHeight: 17, paddingHorizontal: 8 }}>
                Sign in to your account to place buy/sell orders, manage positions, and track your portfolio.
              </Text>
              <TouchableOpacity testID="btn-login-cta" onPress={() => router.push("/(auth)/login")} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, marginTop: 6, width: "100%", alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" }}>Login / Sign Up</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/(auth)/register")} style={{ paddingVertical: 6 }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.mutedForeground }}>
                  New here? <Text style={{ color: colors.primary }}>Create an account</Text>
                </Text>
              </TouchableOpacity>
            </View>
          ) : (<>
            <View style={[styles.sideTabs]}>
              <TouchableOpacity testID="btn-buy" onPress={() => { setSide("buy"); Haptics.selectionAsync(); }}
                style={[styles.sideTab, { borderBottomColor: side==="buy" ? colors.success : "transparent", backgroundColor: side==="buy" ? colors.success+"15" : "transparent" }]}>
                <Text style={[styles.sideTabTxt, { color: side==="buy" ? colors.success : colors.mutedForeground }]}>Buy</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="btn-sell" onPress={() => { setSide("sell"); Haptics.selectionAsync(); }}
                style={[styles.sideTab, { borderBottomColor: side==="sell" ? colors.destructive : "transparent", backgroundColor: side==="sell" ? colors.destructive+"15" : "transparent" }]}>
                <Text style={[styles.sideTabTxt, { color: side==="sell" ? colors.destructive : colors.mutedForeground }]}>Sell</Text>
              </TouchableOpacity>
            </View>

            {/* Order type */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={[styles.typeRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                {(["limit","market","stop-limit","oco"] as const).map(t => (
                  <TouchableOpacity key={t} onPress={() => setOrderType(t)}
                    style={[styles.typeBtn, { backgroundColor: orderType===t ? colors.accent : "transparent" }]}>
                    <Text style={[styles.typeText, { color: orderType===t ? colors.foreground : colors.mutedForeground }]}>
                      {t === "stop-limit" ? "Stop" : t === "oco" ? "OCO" : t.charAt(0).toUpperCase()+t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Available */}
            <TouchableOpacity onPress={() => { if (!user) router.push("/(auth)/login"); else router.push("/wallet"); }}
              style={styles.availRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Feather name="credit-card" size={9} color={colors.mutedForeground} />
                <Text style={[styles.lbl, { color: colors.mutedForeground }]}>Avail.</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={[styles.val, { color: colors.foreground }]}>
                  {fmtBal(availBalance, side === "buy" ? 2 : 6)} {side === "buy" ? quote : base}
                </Text>
                <Feather name="plus-circle" size={11} color={colors.primary} />
              </View>
            </TouchableOpacity>

            {/* Stop Price (stop-limit/oco) */}
            {(orderType === "stop-limit" || orderType === "oco") && (
              <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                <Text style={[styles.inputLbl, { color: colors.mutedForeground }]}>Stop</Text>
                <TextInput value={stopPrice} onChangeText={setStopPrice} keyboardType="numeric"
                  placeholder="0.00" placeholderTextColor={colors.mutedForeground}
                  style={[styles.inputField, { color: colors.foreground }]} />
                <Text style={[styles.inputLbl, { color: colors.mutedForeground }]}>{quote}</Text>
              </View>
            )}

            {/* Price */}
            {orderType !== "market" && (
              <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                <Text style={[styles.inputLbl, { color: colors.mutedForeground }]}>Price</Text>
                <TextInput testID="input-price" value={price} onChangeText={onPriceChange} keyboardType="numeric"
                  style={[styles.inputField, { color: colors.foreground }]} placeholderTextColor={colors.mutedForeground} />
                <Text style={[styles.inputLbl, { color: colors.mutedForeground }]}>{quote}</Text>
              </View>
            )}

            {/* Amount */}
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
              <Text style={[styles.inputLbl, { color: colors.mutedForeground }]}>Amt</Text>
              <TextInput testID="input-amount" value={amount} onChangeText={setAmount} keyboardType="numeric"
                placeholder="0.0000" placeholderTextColor={colors.mutedForeground}
                style={[styles.inputField, { color: colors.foreground }]} />
              <Text style={[styles.inputLbl, { color: colors.mutedForeground }]}>{base}</Text>
            </View>

            {/* Pct slider buttons */}
            <View style={styles.pctRow}>
              {[25,50,75,100].map(p => {
                const active = pct === p;
                const sideC = side === "buy" ? colors.success : colors.destructive;
                return (
                  <TouchableOpacity key={p} onPress={() => handlePct(p)}
                    style={[styles.pctBtn, {
                      borderColor: active ? sideC : colors.border,
                      backgroundColor: active ? sideC : "transparent"
                    }]}>
                    <Text style={[styles.pctTxt, { color: active ? "#fff" : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" }]}>
                      {p === 100 ? "MAX" : `${p}%`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Total + Fee + GST + TDS breakdown */}
            <View style={[styles.summaryBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={styles.summaryRow}>
                <Text style={[styles.lbl, { color: colors.mutedForeground }]}>Order value</Text>
                <Text style={[styles.val, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                  {totalNum > 0 ? fmtBal(totalNum, 2) : "0.00"} {quote}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.lbl, { color: colors.mutedForeground }]}>
                  Fee ({adminFeePct.toFixed(2)}%)
                </Text>
                <Text style={[styles.val, { color: colors.mutedForeground }]}>
                  − {feeAmt > 0 ? fmtBal(feeAmt, isInr ? 2 : 4) : "0.00"} {quote}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.lbl, { color: colors.mutedForeground }]}>
                  GST ({gstPct.toFixed(0)}% on fee)
                </Text>
                <Text style={[styles.val, { color: colors.mutedForeground }]}>
                  − {gstAmt > 0 ? fmtBal(gstAmt, isInr ? 2 : 4) : "0.00"} {quote}
                </Text>
              </View>
              {side === "sell" && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.lbl, { color: colors.destructive }]}>
                    TDS ({tdsPct.toFixed(2)}% on sell)
                  </Text>
                  <Text style={[styles.val, { color: colors.destructive }]}>
                    − {tdsAmt > 0 ? fmtBal(tdsAmt, isInr ? 2 : 4) : "0.00"} {quote}
                  </Text>
                </View>
              )}
              <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4, marginTop: 2 }]}>
                <Text style={[styles.lbl, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>You {side === "buy" ? "receive" : "get"}</Text>
                <Text style={[styles.val, { color: side === "buy" ? colors.success : colors.destructive, fontFamily: "Inter_700Bold" }]}>
                  ≈ {receiveAmt > 0 ? fmtBal(receiveAmt, side === "buy" ? 6 : 2) : "0.00"} {side === "buy" ? base : quote}
                </Text>
              </View>
            </View>

            {/* TIF + Post Only (only Limit) */}
            {orderType === "limit" && (
              <View style={styles.optionsRow}>
                <TouchableOpacity onPress={() => setShowTifModal(true)}
                  style={[styles.tifBtn, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                  <Text style={[styles.tifTxt, { color: colors.foreground }]}>{tif}</Text>
                  <Feather name="chevron-down" size={10} color={colors.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setPostOnly(v=>!v); Haptics.selectionAsync(); }}
                  style={[styles.postOnlyBtn, { borderColor: postOnly ? colors.primary : colors.border, backgroundColor: postOnly ? colors.primary+"18" : "transparent" }]}>
                  <View style={[styles.checkBox, { borderColor: postOnly ? colors.primary : colors.border, backgroundColor: postOnly ? colors.primary : "transparent" }]}>
                    {postOnly && <Feather name="check" size={8} color="#000" />}
                  </View>
                  <Text style={[styles.postOnlyTxt, { color: postOnly ? colors.primary : colors.mutedForeground }]}>Post Only</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* TP/SL toggle */}
            <TouchableOpacity onPress={() => { setShowTpSl(v=>!v); Haptics.selectionAsync(); }}
              style={[styles.tpslToggle, { borderColor: showTpSl ? colors.primary + "60" : colors.border }]}>
              <Feather name="target" size={11} color={showTpSl ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.tpslToggleTxt, { color: showTpSl ? colors.primary : colors.mutedForeground }]}>TP / SL</Text>
              <Feather name={showTpSl ? "chevron-up" : "chevron-down"} size={11} color={colors.mutedForeground} />
            </TouchableOpacity>

            {showTpSl && (
              <View style={{ gap: 6 }}>
                <View style={[styles.inputWrap, { borderColor: colors.success+"60", backgroundColor: colors.secondary }]}>
                  <Text style={[styles.inputLbl, { color: colors.success }]}>TP</Text>
                  <TextInput value={tpPrice} onChangeText={setTpPrice} keyboardType="numeric"
                    placeholder="Take Profit" placeholderTextColor={colors.mutedForeground}
                    style={[styles.inputField, { color: colors.foreground }]} />
                  <Text style={[styles.inputLbl, { color: colors.mutedForeground }]}>{quote}</Text>
                </View>
                <View style={[styles.inputWrap, { borderColor: colors.destructive+"60", backgroundColor: colors.secondary }]}>
                  <Text style={[styles.inputLbl, { color: colors.destructive }]}>SL</Text>
                  <TextInput value={slPrice} onChangeText={setSlPrice} keyboardType="numeric"
                    placeholder="Stop Loss" placeholderTextColor={colors.mutedForeground}
                    style={[styles.inputField, { color: colors.foreground }]} />
                  <Text style={[styles.inputLbl, { color: colors.mutedForeground }]}>{quote}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              testID={`btn-${side}-submit`}
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (!user || !(user as any).isLoggedIn) { router.push("/(auth)/login"); return; }
                const qty = parseFloat(amount || "0");
                const px = parseFloat(price || "0");
                if (!qty || qty <= 0) { Alert.alert("Invalid amount", "Enter a quantity"); return; }
                if (orderType === "limit" && (!px || px <= 0)) { Alert.alert("Invalid price", "Enter a price"); return; }
                try {
                  await tradingApi.placeOrder({
                    pair, side, type: orderType === "market" ? "market" : "limit",
                    price: orderType === "market" ? undefined : px, quantity: qty,
                  });
                  setAmount(""); setPct(0);
                  await refreshWallets();
                  Alert.alert("Order placed", `${side.toUpperCase()} ${qty} ${base}`);
                } catch (e: any) {
                  Alert.alert("Order failed", e?.message || "Unknown error");
                }
              }}
              style={[styles.submitBtn, { backgroundColor: side==="buy" ? colors.success : colors.destructive, shadowColor: side==="buy"?colors.success:colors.destructive }]}>
              <Text style={styles.submitTxt}>
                {user ? (side==="buy" ? `Buy ${base}` : `Sell ${base}`) : `Login to ${side==="buy"?"Buy":"Sell"} ${base}`}
              </Text>
              {totalNum > 0 && (
                <Text style={styles.submitSubTxt}>
                  {orderType === "market" ? "Market" : "Limit"} · {fmtBal(totalNum, 2)} {quote}
                </Text>
              )}
            </TouchableOpacity>
            <View style={styles.feeRow}>
              <Feather name="shield" size={9} color={colors.mutedForeground} />
              <Text style={[styles.feeTxt, { color: colors.mutedForeground }]}>
                VIP {currentFeeTier?.tier ?? 0} · M {(currentFeeTier?.spotMaker ?? 0).toFixed(2)}% / T {(currentFeeTier?.spotTaker ?? 0).toFixed(2)}%
              </Text>
            </View>
          </>)}
          </View>
        </View>

        {/* Bottom Tab Panel */}
        <View style={[styles.bottomCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bottomTabRow}>
            {BOTTOM_TABS.map(t => (
              <TouchableOpacity key={t} onPress={() => setActiveBottomTab(t)}
                style={[styles.bottomTab, { borderBottomColor: activeBottomTab===t ? colors.primary : "transparent" }]}>
                <Text style={[styles.bottomTabTxt, { color: activeBottomTab===t ? colors.primary : colors.mutedForeground }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {activeBottomTab === "Open Orders" && (
            <View>
              {(liveOrders || []).filter((o: any) => o.status === "open" || o.status === "partial").length === 0 && (
                <Text style={{ color: colors.mutedForeground, padding: 16, textAlign: "center" }}>
                  {user ? "No open orders" : "Login to view your orders"}
                </Text>
              )}
              {(liveOrders || []).filter((o: any) => o.status === "open" || o.status === "partial").map((o: any) => {
                const sym = o.symbol || pair;
                const filledPct = o.quantity > 0 ? Math.min(100, (Number(o.filled || 0) / Number(o.quantity)) * 100) : 0;
                return (
                  <View key={o.id} style={[styles.orderRow, { borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.orderHead}>
                        <Text style={[styles.orderPair, { color: colors.foreground }]}>{sym}</Text>
                        <Text style={[styles.orderType, { color: colors.mutedForeground }]}>{o.type}</Text>
                      </View>
                      <View style={styles.orderBody}>
                        <Text style={[styles.orderSide, { color: o.side==="buy"?colors.success:colors.destructive }]}>{o.side?.toUpperCase()}</Text>
                        <Text style={[styles.orderPrice, { color: colors.foreground }]}>${Number(o.price).toFixed(2)}</Text>
                        <Text style={[styles.orderAmt, { color: colors.mutedForeground }]}>{Number(o.quantity).toFixed(4)}</Text>
                      </View>
                      <View style={[styles.filledBar, { backgroundColor: colors.border }]}>
                        <View style={[styles.filledFill, { backgroundColor: o.side==="buy"?colors.success:colors.destructive, width:`${filledPct}%` as any }]} />
                      </View>
                    </View>
                    <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.destructive }]}
                      onPress={async () => {
                        Haptics.selectionAsync();
                        try { await tradingApi.cancelOrder(Number(o.id)); ctxCancelOrder?.(o.id); await refreshWallets(); }
                        catch (e: any) { Alert.alert("Cancel failed", e?.message || "Error"); }
                      }}>
                      <Text style={[styles.cancelTxt, { color: colors.destructive }]}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {activeBottomTab === "Order History" && (
            <View>
              {(liveOrders || []).filter((o: any) => o.status === "filled" || o.status === "cancelled").length === 0 && (
                <Text style={{ color: colors.mutedForeground, padding: 16, textAlign: "center" }}>
                  {user ? "No order history" : "Login to view history"}
                </Text>
              )}
              {(liveOrders || []).filter((o: any) => o.status === "filled" || o.status === "cancelled").map((o: any) => (
                <View key={o.id} style={[styles.orderRow, { borderTopColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.orderHead}>
                      <Text style={[styles.orderPair, { color: colors.foreground }]}>{o.symbol || pair}</Text>
                    </View>
                    <View style={styles.orderBody}>
                      <Text style={[styles.orderSide, { color: o.side==="buy"?colors.success:colors.destructive }]}>{o.side?.toUpperCase()}</Text>
                      <Text style={[styles.orderPrice, { color: colors.foreground }]}>${Number(o.price).toFixed(2)}</Text>
                      <Text style={[styles.orderAmt, { color: colors.mutedForeground }]}>{Number(o.quantity).toFixed(4)}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: (o.status==="filled"?colors.success:colors.mutedForeground)+"22" }]}>
                        <Text style={[styles.statusTxt, { color: o.status==="filled"?colors.success:colors.mutedForeground }]}>{o.status}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {activeBottomTab === "Trade History" && (
            <View>
              {trades.slice(0,10).map((t,i) => (
                <View key={t.id} style={[styles.orderRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.orderPair, { color: colors.foreground }]}>{pair}</Text>
                  <Text style={[styles.orderPrice, { color: t.up ? colors.success : colors.destructive }]}>${t.price}</Text>
                  <Text style={[styles.orderAmt, { color: colors.mutedForeground }]}>{t.amount}</Text>
                  <Text style={[styles.orderTime, { color: colors.mutedForeground }]}>{t.time}</Text>
                </View>
              ))}
            </View>
          )}

          {activeBottomTab === "Funds" && (
            <View>
              {[
                { asset:"USDT", avail:"5,847.32", locked:"500.00", total:"6,347.32" },
                { asset:"BTC",  avail:"0.0854",   locked:"0.0500", total:"0.1354" },
                { asset:"ETH",  avail:"3.7000",   locked:"1.2000", total:"4.9000" },
              ].map((f,i) => (
                <View key={f.asset} style={[styles.fundRow, { borderTopColor: colors.border, borderTopWidth: i>0?1:0 }]}>
                  <Text style={[styles.fundAsset, { color: colors.foreground }]}>{f.asset}</Text>
                  <View style={{ flex:1 }}>
                    <Text style={[styles.fundVal, { color: colors.foreground }]}>Avail: {f.avail}</Text>
                    <Text style={[styles.fundLock, { color: colors.mutedForeground }]}>Locked: {f.locked}</Text>
                  </View>
                  <Text style={[styles.fundTotal, { color: colors.foreground }]}>{f.total}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Pair Modal */}
      <Modal visible={showPairModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Pair</Text>
            {livePairs.map((p: string) => (
              <TouchableOpacity key={p} onPress={() => { setPair(p); setPairTouched(true); setShowPairModal(false); Haptics.selectionAsync(); }}
                style={[styles.pairOpt, { borderTopColor: colors.border, backgroundColor: pair===p?colors.secondary:"transparent" }]}>
                {(() => {
                  const lp = livePriceMap[p] || PAIR_BASE[p] || 0;
                  const ch = liveChangeMap[p] !== undefined ? liveChangeMap[p] : (PAIR_CHANGE[p] || 0);
                  const pq = (p.split("/")[1] || "USDT");
                  const sym = pq === "INR" ? "₹" : "$";
                  return (
                    <>
                      <View>
                        <Text style={[styles.pairOptTxt, { color: pair===p?colors.primary:colors.foreground }]}>{p}</Text>
                        <Text style={[styles.pairOptChange, { color: ch>=0?colors.success:colors.destructive }]}>
                          {ch>=0?"+":""}{ch.toFixed(2)}%
                        </Text>
                      </View>
                      <Text style={[styles.pairOptPrice, { color: colors.foreground }]}>{sym}{fmtP(lp)}</Text>
                    </>
                  );
                })()}
                {pair===p && <Feather name="check" size={15} color={colors.primary} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowPairModal(false)} style={[styles.cancelModal, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.cancelModalTxt, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* TIF Modal */}
      <Modal visible={showTifModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Time In Force</Text>
            {([
              { val:"GTC", desc:"Good Till Cancelled" },
              { val:"IOC", desc:"Immediate Or Cancel" },
              { val:"FOK", desc:"Fill Or Kill" },
            ] as const).map(t => (
              <TouchableOpacity key={t.val} onPress={() => { setTif(t.val); setShowTifModal(false); Haptics.selectionAsync(); }}
                style={[styles.pairOpt, { borderTopColor: colors.border, backgroundColor: tif===t.val?colors.secondary:"transparent" }]}>
                <View>
                  <Text style={[styles.pairOptTxt, { color: tif===t.val?colors.primary:colors.foreground }]}>{t.val}</Text>
                  <Text style={[styles.pairOptChange, { color: colors.mutedForeground }]}>{t.desc}</Text>
                </View>
                {tif===t.val && <Feather name="check" size={15} color={colors.primary} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowTifModal(false)} style={[styles.cancelModal, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.cancelModalTxt, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:14, paddingBottom:8, borderBottomWidth:1 },
  pairBtn: { flexDirection:"row", alignItems:"center", gap:4 },
  pairText: { fontSize:15, fontFamily:"Inter_700Bold" },
  priceBlock: { alignItems:"center" },
  mainPrice: { fontSize:19, fontFamily:"Inter_700Bold" },
  priceChange: { fontSize:10, fontFamily:"Inter_500Medium" },
  headerIcons: { flexDirection:"row", gap:6 },
  smallBtn: { width:30, height:30, borderRadius:15, alignItems:"center", justifyContent:"center" },
  statsBar: { flexDirection:"row", paddingHorizontal:10, paddingVertical:6, borderBottomWidth:1 },
  statItem: { flex:1, alignItems:"center" },
  statL: { fontSize:8.5, fontFamily:"Inter_400Regular", marginBottom:1 },
  statV: { fontSize:10, fontFamily:"Inter_600SemiBold" },
  intervalRow: { flexDirection:"row", alignItems:"center", paddingHorizontal:12, paddingVertical:6, borderBottomWidth:1, gap:4 },
  intervalTab: { paddingHorizontal:8, paddingVertical:5, fontSize:11, fontFamily:"Inter_600SemiBold", borderBottomWidth:2 },
  indicatorRow: { flexDirection:"row", gap:5, marginLeft:"auto" },
  indBtn: { paddingHorizontal:8, paddingVertical:3, borderRadius:6, borderWidth:1 },
  indText: { fontSize:10, fontFamily:"Inter_700Bold" },
  chartWrap: { marginHorizontal:6, marginVertical:4, borderRadius:10, padding:4, overflow:"hidden" },
  yLabel: { fontSize:7.5, fontFamily:"Inter_400Regular" },
  mainRow: { flexDirection:"row", gap:6, marginHorizontal:6, marginBottom:6 },
  leftPanel: { width:"42%", borderRadius:12, borderWidth:1, padding:6, overflow:"hidden" },
  obTabRow: { flexDirection:"row", borderBottomWidth:1, borderBottomColor:"#2b2f36", marginBottom:4 },
  obTab: { flex:1, alignItems:"center", paddingVertical:4, borderBottomWidth:1.5 },
  obTabText: { fontSize:10, fontFamily:"Inter_600SemiBold" },
  obColRow: { flexDirection:"row", justifyContent:"space-between", marginBottom:2 },
  obColText: { fontSize:8.5, fontFamily:"Inter_500Medium" },
  obRow: { flexDirection:"row", justifyContent:"space-between", paddingVertical:2.5, overflow:"hidden", position:"relative" },
  obBar: { position:"absolute", top:0, bottom:0 },
  obPrice: { fontSize:9, fontFamily:"Inter_500Medium", zIndex:1 },
  obAmt: { fontSize:9, fontFamily:"Inter_400Regular", zIndex:1 },
  spreadRow: { flexDirection:"row", alignItems:"center", gap:3, paddingVertical:3, paddingHorizontal:3, borderRadius:4, marginVertical:1 },
  spreadP: { fontSize:9.5, fontFamily:"Inter_700Bold" },
  orderForm: { flex:1, borderRadius:12, borderWidth:1, overflow:"hidden", padding:9 },
  sideTabs: { flexDirection:"row", borderBottomWidth:1, borderBottomColor:"#2b2f36", marginBottom:8 },
  sideTab: { flex:1, alignItems:"center", paddingVertical:7, borderBottomWidth:2 },
  sideTabTxt: { fontSize:12, fontFamily:"Inter_700Bold" },
  typeRow: { flexDirection:"row", borderRadius:8, overflow:"hidden", borderWidth:1 },
  typeBtn: { paddingHorizontal:8, paddingVertical:5, alignItems:"center" },
  typeText: { fontSize:9.5, fontFamily:"Inter_600SemiBold" },
  dataRow: { flexDirection:"row", justifyContent:"space-between", marginBottom:5 },
  availRow: { flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:6, paddingVertical:3 },
  summaryBox: { borderRadius:8, borderWidth:1, padding:7, marginBottom:7, gap:3 },
  summaryRow: { flexDirection:"row", justifyContent:"space-between", alignItems:"center" },
  submitSubTxt: { fontSize:9.5, fontFamily:"Inter_500Medium", color:"rgba(255,255,255,0.85)", marginTop:2 },
  feeRow: { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:3, marginTop:1 },
  lbl: { fontSize:9.5, fontFamily:"Inter_400Regular" },
  val: { fontSize:9.5, fontFamily:"Inter_600SemiBold" },
  inputWrap: { flexDirection:"row", alignItems:"center", borderRadius:7, borderWidth:1, paddingHorizontal:7, paddingVertical:5, marginBottom:6 },
  inputLbl: { fontSize:9, fontFamily:"Inter_500Medium" },
  inputField: { flex:1, fontSize:11, fontFamily:"Inter_600SemiBold", textAlign:"right", padding:0, paddingHorizontal:3 },
  pctRow: { flexDirection:"row", gap:4, marginBottom:6 },
  pctBtn: { flex:1, paddingVertical:4, borderRadius:5, borderWidth:1, alignItems:"center" },
  pctTxt: { fontSize:9, fontFamily:"Inter_600SemiBold" },
  optionsRow: { flexDirection:"row", gap:6, marginBottom:6 },
  tifBtn: { flexDirection:"row", alignItems:"center", gap:3, borderWidth:1, borderRadius:6, paddingHorizontal:7, paddingVertical:4 },
  tifTxt: { fontSize:10, fontFamily:"Inter_600SemiBold" },
  postOnlyBtn: { flex:1, flexDirection:"row", alignItems:"center", gap:4, borderWidth:1, borderRadius:6, paddingHorizontal:7, paddingVertical:4 },
  postOnlyTxt: { fontSize:10, fontFamily:"Inter_500Medium" },
  checkBox: { width:12, height:12, borderRadius:3, borderWidth:1, alignItems:"center", justifyContent:"center" },
  tpslToggle: { flexDirection:"row", alignItems:"center", gap:5, borderWidth:1, borderRadius:7, paddingHorizontal:8, paddingVertical:5, marginBottom:6 },
  tpslToggleTxt: { flex:1, fontSize:10, fontFamily:"Inter_600SemiBold" },
  submitBtn: { borderRadius:7, paddingVertical:9, alignItems:"center", marginBottom:4, marginTop:4 },
  submitTxt: { fontSize:12, fontFamily:"Inter_700Bold", color:"#fff" },
  feeTxt: { fontSize:8.5, fontFamily:"Inter_400Regular", textAlign:"center", color:"#848e9c" },
  bottomCard: { marginHorizontal:6, marginBottom:6, borderRadius:12, borderWidth:1 },
  bottomTabRow: { paddingHorizontal:12, gap:4, paddingTop:8 },
  bottomTab: { paddingHorizontal:10, paddingVertical:8, borderBottomWidth:2 },
  bottomTabTxt: { fontSize:11, fontFamily:"Inter_600SemiBold", whiteSpace:"nowrap" } as any,
  orderRow: { flexDirection:"row", alignItems:"center", paddingHorizontal:12, paddingVertical:10, borderTopWidth:1, gap:8 },
  orderHead: { flexDirection:"row", alignItems:"center", gap:8, marginBottom:3 },
  orderBody: { flexDirection:"row", alignItems:"center", gap:6 },
  orderPair: { fontSize:11, fontFamily:"Inter_600SemiBold" },
  orderType: { fontSize:9, fontFamily:"Inter_400Regular" },
  orderTime: { fontSize:9, fontFamily:"Inter_400Regular" },
  orderSide: { fontSize:10, fontFamily:"Inter_700Bold" },
  orderPrice: { fontSize:10, fontFamily:"Inter_500Medium" },
  orderAmt: { fontSize:10, fontFamily:"Inter_400Regular" },
  filledBar: { height:2, borderRadius:1, marginTop:4, overflow:"hidden" },
  filledFill: { height:2 },
  statusBadge: { paddingHorizontal:5, paddingVertical:1, borderRadius:4 },
  statusTxt: { fontSize:9, fontFamily:"Inter_600SemiBold" },
  cancelBtn: { borderWidth:1, borderRadius:5, paddingHorizontal:7, paddingVertical:4, marginLeft:"auto" },
  cancelTxt: { fontSize:10, fontFamily:"Inter_600SemiBold" },
  fundRow: { flexDirection:"row", alignItems:"center", paddingHorizontal:12, paddingVertical:10, gap:10 },
  fundAsset: { width:40, fontSize:12, fontFamily:"Inter_700Bold" },
  fundVal: { fontSize:10, fontFamily:"Inter_500Medium" },
  fundLock: { fontSize:9, fontFamily:"Inter_400Regular" },
  fundTotal: { fontSize:11, fontFamily:"Inter_600SemiBold" },
  modalOverlay: { flex:1, justifyContent:"flex-end", backgroundColor:"#00000088" },
  modalSheet: { borderTopLeftRadius:20, borderTopRightRadius:20, borderWidth:1, padding:16, paddingBottom:36 },
  handle: { width:40, height:4, borderRadius:2, alignSelf:"center", marginBottom:14 },
  modalTitle: { fontSize:16, fontFamily:"Inter_700Bold", marginBottom:12 },
  pairOpt: { flexDirection:"row", alignItems:"center", paddingVertical:13, borderTopWidth:1, gap:8 },
  pairOptTxt: { fontSize:14, fontFamily:"Inter_600SemiBold" },
  pairOptChange: { fontSize:11, fontFamily:"Inter_500Medium" },
  pairOptPrice: { marginLeft:"auto", fontSize:13, fontFamily:"Inter_600SemiBold" },
  cancelModal: { borderRadius:12, paddingVertical:14, alignItems:"center", marginTop:12 },
  cancelModalTxt: { fontSize:14, fontFamily:"Inter_600SemiBold" },
} as any);
