import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, Dimensions, StyleSheet, Platform, PanResponder, TouchableOpacity } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Path, G } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useColors } from '@/hooks/useColors';

interface Candle { ts: number; open: number; high: number; low: number; close: number; volume: number; }

interface CandleChartProps {
  symbol: string;
  interval: string;
  livePrice?: number;
  height?: number;
  quoteSymbol?: 'USDT' | 'INR';
  inrRate?: number;
}

const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000, '6h': 21_600_000, '12h': 43_200_000,
  '1d': 86_400_000, '1w': 604_800_000,
};

function formatPrice(p: number, quote: 'USDT' | 'INR') {
  if (!isFinite(p)) return '—';
  const sym = quote === 'INR' ? '₹' : '$';
  if (p >= 1000) return `${sym}${p.toLocaleString(quote === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 2 })}`;
  if (p >= 1) return `${sym}${p.toFixed(2)}`;
  if (p >= 0.01) return `${sym}${p.toFixed(4)}`;
  return `${sym}${p.toFixed(6)}`;
}
function formatVol(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(2);
}
function formatTime(ts: number, interval: string) {
  const d = new Date(ts);
  if (interval === '1d' || interval === '1w') return `${d.getDate()}/${d.getMonth() + 1}`;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function CandleChart({ symbol, interval, livePrice, height = 280, quoteSymbol = 'USDT', inrRate = 1 }: CandleChartProps) {
  const colors = useColors();
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(Dimensions.get('window').width - 32);
  const fetchedKey = useRef('');

  // Zoom & pan state
  const MIN_VISIBLE = 15;
  const MAX_VISIBLE = 300;
  const [visibleCount, setVisibleCount] = useState(90);
  const [endOffset, setEndOffset] = useState(0); // candles back from latest (0 = latest)
  const containerRef = useRef<View>(null);
  const panState = useRef({ startCount: 90, startOffset: 0, startPinchDist: 0, startTwoFingerCount: 90 });

  const clampVisible = (n: number) => Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, Math.round(n)));
  const clampOffset = (o: number, total: number, vis: number) => Math.max(0, Math.min(o, Math.max(0, total - vis)));

  const zoomIn = useCallback(() => setVisibleCount(v => clampVisible(v / 1.4)), []);
  const zoomOut = useCallback(() => setVisibleCount(v => clampVisible(v * 1.4)), []);
  const reset = useCallback(() => { setVisibleCount(90); setEndOffset(0); }, []);

  // Web mouse wheel zoom
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node: any = containerRef.current;
    if (!node) return;
    const el: HTMLElement | null = (typeof (node as any).getBoundingClientRect === 'function') ? (node as any) : ((node as any)._nativeTag ? document.querySelector(`[data-chart-zoom="1"]`) : null);
    const target: HTMLElement | null = el || (document.querySelector('[data-chart-zoom="1"]') as HTMLElement | null);
    if (!target) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setVisibleCount(v => clampVisible(v * factor));
    };
    target.addEventListener('wheel', onWheel, { passive: false });
    return () => target.removeEventListener('wheel', onWheel);
  }, [width]);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setWidth(Math.min(window.width - 32, 1200)));
    return () => sub?.remove();
  }, []);

  // Fetch candles when symbol/interval changes
  useEffect(() => {
    const key = `${symbol}:${interval}`;
    fetchedKey.current = key;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await api.get<{ candles: Candle[] }>(`/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=120`);
        if (fetchedKey.current !== key) return;
        setCandles(r.candles || []);
      } catch (e: any) {
        if (fetchedKey.current !== key) return;
        setError(e?.message || 'Failed to load chart');
      } finally {
        if (fetchedKey.current === key) setLoading(false);
      }
    })();

    // Refetch periodically to roll new candles
    const intervalMs = INTERVAL_MS[interval] || 60_000;
    const refetchEvery = Math.min(intervalMs, 30_000);
    const t = setInterval(async () => {
      try {
        const r = await api.get<{ candles: Candle[] }>(`/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=120`);
        if (fetchedKey.current !== key) return;
        setCandles(r.candles || []);
      } catch {}
    }, refetchEvery);
    return () => clearInterval(t);
  }, [symbol, interval]);

  // Live update last candle from livePrice (USDT)
  const liveUsdt = livePrice && quoteSymbol === 'INR' ? livePrice / (inrRate || 1) : (livePrice || 0);
  const displayCandles = useMemo(() => {
    if (!candles.length) return candles;
    if (!liveUsdt) return candles;
    const intervalMs = INTERVAL_MS[interval] || 60_000;
    const last = candles[candles.length - 1];
    const now = Date.now();
    const lastBucket = Math.floor(last.ts / intervalMs) * intervalMs;
    const currBucket = Math.floor(now / intervalMs) * intervalMs;
    if (currBucket > lastBucket) {
      // Start a new candle
      return [...candles, {
        ts: currBucket,
        open: last.close,
        high: Math.max(last.close, liveUsdt),
        low: Math.min(last.close, liveUsdt),
        close: liveUsdt,
        volume: 0,
      }];
    }
    // Update last candle
    const upd = { ...last, close: liveUsdt, high: Math.max(last.high, liveUsdt), low: Math.min(last.low, liveUsdt) };
    return [...candles.slice(0, -1), upd];
  }, [candles, liveUsdt, interval]);

  // Convert to display quote (INR or USDT)
  const factor = quoteSymbol === 'INR' ? (inrRate || 1) : 1;
  const scaled = useMemo(() => displayCandles.map(c => ({
    ts: c.ts,
    open: c.open * factor,
    high: c.high * factor,
    low: c.low * factor,
    close: c.close * factor,
    volume: c.volume,
  })), [displayCandles, factor]);

  // PanResponder must be created before any early return to keep hook order stable
  const panResponderRef = useRef({ visibleCount: 90, endOffset: 0, candleW: 1, total: 0 });
  panResponderRef.current = { visibleCount, endOffset, candleW: 1, total: scaled.length };
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2 || (g.numberActiveTouches ?? 0) >= 2,
    onPanResponderGrant: (e) => {
      panState.current.startCount = panResponderRef.current.visibleCount;
      panState.current.startOffset = panResponderRef.current.endOffset;
      const touches = (e.nativeEvent as any).touches || [];
      if (touches.length >= 2) {
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        panState.current.startPinchDist = Math.hypot(dx, dy) || 1;
        panState.current.startTwoFingerCount = panResponderRef.current.visibleCount;
      }
    },
    onPanResponderMove: (e, g) => {
      const touches = (e.nativeEvent as any).touches || [];
      const cur = panResponderRef.current;
      if (touches.length >= 2) {
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        const dist = Math.hypot(dx, dy) || 1;
        const ratio = panState.current.startPinchDist / dist;
        setVisibleCount(clampVisible(panState.current.startTwoFingerCount * ratio));
      } else {
        const dxCandles = Math.round((g.dx / Math.max(1, cur.candleW)) || 0);
        setEndOffset(clampOffset(panState.current.startOffset + dxCandles, cur.total, cur.visibleCount));
      }
    },
  }), []);

  if (loading && !scaled.length) {
    return (
      <View style={[chartStyles(colors).box, { height }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={chartStyles(colors).muted}>Loading chart…</Text>
      </View>
    );
  }
  if (error && !scaled.length) {
    return (
      <View style={[chartStyles(colors).box, { height }]}>
        <Text style={chartStyles(colors).err}>{error}</Text>
      </View>
    );
  }
  if (!scaled.length) {
    return (
      <View style={[chartStyles(colors).box, { height }]}>
        <Text style={chartStyles(colors).muted}>No data</Text>
      </View>
    );
  }

  // Layout
  const padding = { top: 14, bottom: 28, left: 8, right: 64 };
  const volHeight = Math.max(34, height * 0.18);
  const gap = 6;
  const priceHeight = height - padding.top - padding.bottom - volHeight - gap;
  const innerW = width - padding.left - padding.right;

  const total = scaled.length;
  const safeOffset = clampOffset(endOffset, total, visibleCount);
  const endIdx = total - safeOffset;
  const startIdx = Math.max(0, endIdx - visibleCount);
  const visible = scaled.slice(startIdx, endIdx);
  const candleW = innerW / Math.max(1, visible.length);
  panResponderRef.current.candleW = candleW;
  const bodyGap = Math.max(0.5, candleW * 0.18);

  const highs = visible.map(c => c.high);
  const lows = visible.map(c => c.low);
  let maxP = Math.max(...highs);
  let minP = Math.min(...lows);
  const pad = (maxP - minP) * 0.06 || maxP * 0.001;
  maxP += pad; minP -= pad;
  const range = maxP - minP || 1;
  const priceToY = (p: number) => padding.top + priceHeight - ((p - minP) / range) * priceHeight;

  const maxVol = Math.max(...visible.map(c => c.volume), 1);
  const volBaseY = padding.top + priceHeight + gap + volHeight;
  const volToY = (v: number) => volBaseY - (v / maxVol) * volHeight;

  // MA20 (over close prices, scaled set)
  const ma: (number | null)[] = visible.map((_, i) => {
    if (i < 19) return null;
    let s = 0;
    for (let j = i - 19; j <= i; j++) s += visible[j].close;
    return s / 20;
  });
  let mapath = '';
  ma.forEach((v, i) => {
    if (v == null) return;
    const x = padding.left + i * candleW + candleW / 2;
    const y = priceToY(v);
    mapath += (mapath ? ' L' : 'M') + ` ${x.toFixed(2)} ${y.toFixed(2)}`;
  });

  // Grid lines (5 horizontal)
  const gridLines = 5;
  const gridYs = Array.from({ length: gridLines + 1 }, (_, i) => {
    const p = minP + (range * (gridLines - i)) / gridLines;
    return { y: priceToY(p), price: p };
  });

  const lastCandle = visible[visible.length - 1];
  const lastPrice = lastCandle.close;
  const lastY = priceToY(lastPrice);
  const lastIsGreen = lastCandle.close >= lastCandle.open;
  const lastColor = lastIsGreen ? '#0ECB81' : '#F6465D';

  // Time axis labels (5 evenly spaced)
  const timeMarks = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const i = Math.min(visible.length - 1, Math.floor(f * (visible.length - 1)));
    return { x: padding.left + i * candleW + candleW / 2, label: formatTime(visible[i].ts, interval) };
  });

  const c = colors;
  const gridColor = c.border;
  const axisColor = c.mutedForeground;

  return (
    <View
      ref={containerRef}
      // @ts-ignore web-only attribute used for wheel handler
      dataSet={{ chartZoom: '1' }}
      style={[chartStyles(c).box, { height, padding: 0 }]}
      onLayout={(e) => setWidth(Math.max(280, e.nativeEvent.layout.width))}
      {...panResponder.panHandlers}
    >
      <Svg width={width} height={height}>
        {/* Background grid */}
        {gridYs.map((g, i) => (
          <G key={`g${i}`}>
            <Line x1={padding.left} y1={g.y} x2={width - padding.right} y2={g.y} stroke={gridColor} strokeWidth={0.5} strokeDasharray="3 3" />
            <SvgText x={width - padding.right + 4} y={g.y + 3} fill={axisColor} fontSize={9}>
              {formatPrice(g.price, quoteSymbol).replace(/[₹$]/, '')}
            </SvgText>
          </G>
        ))}

        {/* Volume bars */}
        {visible.map((cd, i) => {
          const x = padding.left + i * candleW + bodyGap;
          const w = Math.max(1, candleW - bodyGap * 2);
          const isGreen = cd.close >= cd.open;
          const vy = volToY(cd.volume);
          const vh = Math.max(0.5, volBaseY - vy);
          return <Rect key={`v${i}`} x={x} y={vy} width={w} height={vh} fill={(isGreen ? '#0ECB81' : '#F6465D') + '55'} />;
        })}

        {/* Candles */}
        {visible.map((cd, i) => {
          const x = padding.left + i * candleW;
          const cx = x + candleW / 2;
          const isGreen = cd.close >= cd.open;
          const col = isGreen ? '#0ECB81' : '#F6465D';
          const bodyTop = priceToY(Math.max(cd.open, cd.close));
          const bodyBot = priceToY(Math.min(cd.open, cd.close));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          return (
            <G key={`c${i}`}>
              <Line x1={cx} y1={priceToY(cd.high)} x2={cx} y2={bodyTop} stroke={col} strokeWidth={1} />
              <Rect x={x + bodyGap} y={bodyTop} width={Math.max(1, candleW - bodyGap * 2)} height={bodyH} fill={col} rx={0.5} />
              <Line x1={cx} y1={bodyBot} x2={cx} y2={priceToY(cd.low)} stroke={col} strokeWidth={1} />
            </G>
          );
        })}

        {/* MA20 */}
        {mapath ? <Path d={mapath} stroke="#F0B90B" strokeWidth={1.2} fill="none" /> : null}

        {/* Last price line */}
        <Line x1={padding.left} y1={lastY} x2={width - padding.right} y2={lastY} stroke={lastColor} strokeWidth={0.6} strokeDasharray="2 3" opacity={0.85} />
        <Rect x={width - padding.right + 1} y={lastY - 8} width={padding.right - 2} height={16} fill={lastColor} rx={2} />
        <SvgText x={width - padding.right + 4} y={lastY + 3.5} fill="#fff" fontSize={9} fontWeight="700">
          {formatPrice(lastPrice, quoteSymbol).replace(/[₹$]/, '')}
        </SvgText>

        {/* Time axis */}
        {timeMarks.map((m, i) => (
          <SvgText key={`t${i}`} x={m.x} y={height - 8} fill={axisColor} fontSize={9} textAnchor="middle">
            {m.label}
          </SvgText>
        ))}

        {/* Header chip: O H L C + MA20 */}
        <SvgText x={padding.left + 4} y={11} fill={axisColor} fontSize={9}>
          {`O ${formatPrice(lastCandle.open, quoteSymbol)}  H ${formatPrice(lastCandle.high, quoteSymbol)}  L ${formatPrice(lastCandle.low, quoteSymbol)}  C ${formatPrice(lastCandle.close, quoteSymbol)}  Vol ${formatVol(lastCandle.volume)}`}
        </SvgText>
      </Svg>
      <View style={chartStyles(c).legendRow} pointerEvents="none">
        <View style={[chartStyles(c).dot, { backgroundColor: '#F0B90B' }]} />
        <Text style={chartStyles(c).legendText}>MA(20)</Text>
        <View style={{ width: 12 }} />
        <View style={[chartStyles(c).dot, { backgroundColor: '#0ECB81' }]} />
        <Text style={chartStyles(c).legendText}>Vol</Text>
      </View>

      {/* Zoom controls */}
      <View style={chartStyles(c).zoomRow}>
        <TouchableOpacity onPress={zoomIn} style={chartStyles(c).zoomBtn}>
          <Feather name="zoom-in" size={13} color={c.foreground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={zoomOut} style={chartStyles(c).zoomBtn}>
          <Feather name="zoom-out" size={13} color={c.foreground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={reset} style={chartStyles(c).zoomBtn}>
          <Feather name="maximize-2" size={13} color={c.foreground} />
        </TouchableOpacity>
        <View style={chartStyles(c).zoomInfo}>
          <Text style={chartStyles(c).zoomInfoText}>{visible.length}{safeOffset > 0 ? ` ←${safeOffset}` : ''}</Text>
        </View>
      </View>
    </View>
  );
}

const chartStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  box: { backgroundColor: c.card, borderRadius: 12, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  muted: { color: c.mutedForeground, fontSize: 12, marginTop: 6 },
  err: { color: '#F6465D', fontSize: 12 },
  legendRow: { position: 'absolute', top: 26, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: c.mutedForeground, fontSize: 9, marginLeft: 3 },
  zoomRow: { position: 'absolute', top: 8, right: 70, flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoomBtn: { width: 24, height: 24, borderRadius: 6, backgroundColor: c.secondary + 'cc', alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: c.border },
  zoomInfo: { paddingHorizontal: 6, height: 24, borderRadius: 6, backgroundColor: c.secondary + 'cc', alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: c.border, marginLeft: 2 },
  zoomInfoText: { color: c.mutedForeground, fontSize: 9, fontWeight: '600' },
});
