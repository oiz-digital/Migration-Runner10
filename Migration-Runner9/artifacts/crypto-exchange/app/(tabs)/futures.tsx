import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Platform, Modal, Animated
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

const PERP_PAIRS = [
  { label:"BTCUSDT PERP", base:64250, change:2.5, color:"#F7931A" },
  { label:"ETHUSDT PERP", base:3180,  change:-1.2, color:"#627EEA" },
  { label:"BNBUSDT PERP", base:580,   change:5.4, color:"#F3BA2F" },
  { label:"SOLUSDT PERP", base:142,   change:8.2, color:"#9945FF" },
  { label:"AVAXUSDT PERP",base:38.4,  change:4.6, color:"#E84142" },
];
const LEVERAGES = [1,2,3,5,10,15,20,25,50,75,100,125];
const INTERVALS = ["1m","5m","15m","1H","4H","1D"];

interface Candle { open:number; high:number; low:number; close:number; vol:number }
interface Position {
  symbol:string; side:"Long"|"Short"; leverage:number; size:string; entry:string;
  markPrice:string; liqPrice:string; margin:string; pnl:string; pnlPct:string;
  marginMode:"Cross"|"Isolated"; roe:string; adl:number;
}

function genCandles(base:number, n=40):Candle[] {
  const out:Candle[]=[];
  let p=base*0.97;
  for(let i=0;i<n;i++){
    const open=p;
    const move=(Math.random()-0.47)*base*0.013;
    const close=Math.max(base*0.5,open+move);
    const high=Math.max(open,close)+Math.random()*base*0.004;
    const low=Math.min(open,close)-Math.random()*base*0.004;
    out.push({open,high,low,close,vol:Math.random()*100+10});
    p=close;
  }
  return out;
}

function MiniCandleChart({ candles, width, height }: { candles:Candle[]; width:number; height:number }) {
  if(!candles.length||!width) return null;
  const volH=24;
  const chartH=height-volH-2;
  const ps=candles.flatMap(c=>[c.high,c.low]);
  const mn=Math.min(...ps),mx=Math.max(...ps);
  const range=mx-mn||1;
  const vols=candles.map(c=>c.vol);
  const maxVol=Math.max(...vols);
  const slot=width/candles.length;
  const cw=Math.max(2,slot-1.5);
  const py=(v:number)=>((mx-v)/range)*chartH;
  return (
    <View style={{width,overflow:"hidden"}}>
      <View style={{width,height:chartH}}>
        {[0,1,2,3].map(i=>(
          <View key={i} style={{position:"absolute",left:0,right:0,top:(i/3)*chartH,height:1,backgroundColor:"#2b2f3618"}}/>
        ))}
        {candles.map((c,i)=>{
          const x=i*slot+(slot-cw)/2;
          const green=c.close>=c.open;
          const col=green?"#0ecb81":"#f6465d";
          const bt=py(Math.max(c.open,c.close));
          const bh=Math.max(1.5,Math.abs(py(c.open)-py(c.close)));
          const wt=py(c.high),wh=Math.max(1,Math.abs(py(c.high)-py(c.low)));
          return(
            <View key={i} pointerEvents="none">
              <View style={{position:"absolute",left:x+cw/2-0.5,top:wt,width:1,height:wh,backgroundColor:col,opacity:0.8}}/>
              <View style={{position:"absolute",left:x,top:bt,width:cw,height:bh,backgroundColor:col}}/>
            </View>
          );
        })}
      </View>
      <View style={{width,height:volH,flexDirection:"row",alignItems:"flex-end",marginTop:2}}>
        {candles.map((c,i)=>{
          const green=c.close>=c.open;
          const bh=Math.max(2,(c.vol/maxVol)*(volH-3));
          return(
            <View key={i} style={{
              width:Math.max(2,cw),marginHorizontal:(slot-cw)/2,
              height:bh,backgroundColor:green?"#0ecb8138":"#f6465d38",
              borderTopLeftRadius:1,borderTopRightRadius:1,
            }}/>
          );
        })}
      </View>
    </View>
  );
}

function fmtUsd(n: number) { return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function adaptPosition(p: any): Position {
  const side: "Long" | "Short" = (p.side === "long" || p.side === "Long") ? "Long" : "Short";
  const lev = Number(p.leverage ?? 1);
  const qty = Number(p.qty ?? 0);
  const entry = Number(p.entryPrice ?? 0);
  const mark = Number(p.markPrice ?? entry);
  const margin = Number(p.marginAmount ?? 0);
  const liq = Number(p.liquidationPrice ?? 0);
  const pnl = side === "Long" ? (mark - entry) * qty : (entry - mark) * qty;
  const roe = margin > 0 ? (pnl / margin) * 100 : 0;
  const sym = p.symbol ?? p.pairSymbol ?? "";
  return {
    symbol: sym, side, leverage: lev,
    size: `${qty.toFixed(4)}`, entry: fmtUsd(entry), markPrice: fmtUsd(mark),
    liqPrice: fmtUsd(liq), margin: fmtUsd(margin),
    pnl: `${pnl >= 0 ? "+" : ""}${fmtUsd(pnl)}`,
    pnlPct: `${pnl >= 0 ? "+" : ""}${roe.toFixed(2)}%`,
    marginMode: p.marginType === "cross" ? "Cross" : "Isolated",
    roe: `${pnl >= 0 ? "+" : ""}${roe.toFixed(2)}%`,
    adl: 2,
  };
}

const FUNDING_HISTORY: { time:string; rate:string; cost:string; color:string }[] = [];

export default function FuturesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { apiPairs, apiCoins, apiWallets } = useApp();
  const futPairs = useMemo(() => {
    const coinById = new Map<number, any>();
    (apiCoins || []).forEach((c: any) => coinById.set(c.id, c));
    const list = (apiPairs || [])
      .filter((p: any) => p.futuresEnabled && p.status === "active")
      .map((p: any) => {
        const base = coinById.get(p.baseCoinId)?.symbol ?? "";
        const quote = coinById.get(p.quoteCoinId)?.symbol ?? "";
        return {
          label: `${base}/${quote}`,
          base: Number(p.lastPrice) || 0,
          change: Number(p.change24h) || 0,
          color: PERP_PAIRS.find(x => x.label.startsWith(base))?.color || "#888",
        };
      });
    return list;
  }, [apiPairs, apiCoins]);
  const [selectedPair, setSelectedPair] = useState<any>(futPairs[0] || { label: "", base: 0, change: 0, color: "#888" });
  const params = useLocalSearchParams<{ pair?: string }>();
  const queryPair = typeof params.pair === "string" ? params.pair : undefined;
  useEffect(() => {
    if (!futPairs.length) return;
    if (queryPair) {
      const q = queryPair.toUpperCase();
      const base = q.split("/")[0];
      const next = futPairs.find(p => p.label === q)
        || futPairs.find(p => p.label.split("/")[0] === base);
      if (next) { setSelectedPair(next); return; }
    }
    setSelectedPair((prev: any) => futPairs.find(p => p.label === prev?.label) || futPairs[0]);
  }, [futPairs, queryPair]);
  const futQuote = (selectedPair?.label || "").split("/")[1] || "USDT";
  const futSym = futQuote === "INR" ? "₹" : "$";
  const [showPairModal, setShowPairModal] = useState(false);
  const [leverage, setLeverage] = useState(10);
  const [showLevModal, setShowLevModal] = useState(false);
  const [marginMode, setMarginMode] = useState<"Cross"|"Isolated">("Cross");
  const [side, setSide] = useState<"long"|"short">("long");
  const [orderType, setOrderType] = useState<"limit"|"market"|"stop">("limit");
  const [price, setPrice] = useState("64250.50");
  const [amount, setAmount] = useState("");
  const [pct, setPct] = useState(0);
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [showTpSl, setShowTpSl] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(64250.50);
  const [fundingRate] = useState("0.0102%");
  const [countdown, setCountdown] = useState(6138);
  const [candles, setCandles] = useState<Candle[]>(()=>genCandles(64250));
  const [chartWidth, setChartWidth] = useState(0);
  const [interval_, setInterval_] = useState("1H");
  const [activeTab, setActiveTab] = useState<"positions"|"orders"|"funding"|"history">("positions");
  const [positions, setPositions] = useState<Position[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { futuresApi } = await import("@/lib/api");
        const rows = await futuresApi.getPositions();
        if (alive) setPositions(rows.map(adaptPosition));
      } catch { if (alive) setPositions([]); }
    };
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;
  const priceUpRef = useRef(true);

  useEffect(() => {
    setCurrentPrice(selectedPair.base);
    setPrice(selectedPair.base.toFixed(2));
    setCandles(genCandles(selectedPair.base));
  }, [selectedPair]);

  useEffect(() => {
    const iv = setInterval(() => {
      setCurrentPrice(p => {
        const next = p * (1 + (Math.random() - 0.499) * 0.0009);
        priceUpRef.current = next > p;
        return next;
      });
      setCountdown(c => c > 0 ? c - 1 : 28800);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const fmt = (v: number) => v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtTime = (s: number) => {
    const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };
  const posValue = price && amount ? (parseFloat(price) * parseFloat(amount)).toFixed(2) : "0.00";
  const reqMargin = posValue !== "0.00" ? (parseFloat(posValue) / leverage).toFixed(2) : "0.00";
  const estLiq = price && amount && reqMargin !== "0.00"
    ? (parseFloat(price) * (1 - 1/leverage * 0.88)).toFixed(2) : "—";
  const futuresMargin = useMemo(() => {
    const quoteSym = (selectedPair?.label || "").split("/")[1] || "USDT";
    const w = (apiWallets || []).find((x: any) => x.walletType === "futures" && x.symbol === quoteSym);
    return Number(w?.available ?? 0);
  }, [apiWallets, selectedPair]);
  const maxOpen = (futuresMargin * leverage).toFixed(2);

  const handlePct = useCallback((p:number) => {
    setPct(p);
    const pr = parseFloat(price||"1")||1;
    setAmount(((1240.50 * leverage * p / 100) / pr).toFixed(4));
  }, [price, leverage]);

  const ADLBar = ({ level }: { level: number }) => (
    <View style={{ flexDirection:"row", gap:1 }}>
      {[1,2,3,4,5].map(i => (
        <View key={i} style={{ width:6, height:6, borderRadius:1,
          backgroundColor: i <= level ? colors.primary : colors.border }} />
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad+8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setShowPairModal(true)} style={styles.pairBtn}>
          <View style={[styles.pairDot, { backgroundColor: selectedPair.color }]} />
          <Text style={[styles.pairText, { color: colors.foreground }]}>{selectedPair.label}</Text>
          <Feather name="chevron-down" size={12} color={colors.mutedForeground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.mainPrice, { color: priceUpRef.current ? colors.success : colors.destructive }]}>
            {futSym}{fmt(currentPrice)}
          </Text>
          <Text style={[styles.priceChange, { color: (selectedPair?.change ?? 0) >= 0 ? colors.success : colors.destructive }]}>
            {(selectedPair?.change ?? 0) >= 0 ? "+" : ""}{selectedPair?.change ?? 0}%
          </Text>
        </View>
        <TouchableOpacity style={[styles.marginModeBtn, { borderColor: colors.border, backgroundColor: colors.secondary }]}
          onPress={() => { setMarginMode(m => m==="Cross"?"Isolated":"Cross"); Haptics.selectionAsync(); }}>
          <Feather name={marginMode==="Cross"?"link":"lock"} size={11} color={colors.primary} />
          <Text style={[styles.marginModeText, { color: colors.primary }]}>{marginMode}</Text>
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      <View style={[styles.statsBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label:"Mark", value:fmt(currentPrice*0.9999) },
          { label:"Index", value:fmt(currentPrice*0.9998) },
          { label:"Funding", value:fundingRate, green:true },
          { label:"Countdown", value:fmtTime(countdown) },
        ].map(s => (
          <View key={s.label} style={styles.statItem}>
            <Text style={[styles.statL, { color: colors.mutedForeground }]}>{s.label}</Text>
            <Text style={[styles.statV, { color: s.green ? colors.success : colors.foreground }]}>{s.value}</Text>
          </View>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Platform.OS==="web" ? bottomPad+84 : 90 }}>

        {/* Chart */}
        <View style={[styles.chartWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.intervalRow}>
            {INTERVALS.map(iv => (
              <TouchableOpacity key={iv} onPress={() => { setInterval_(iv); setCandles(genCandles(selectedPair.base)); }}>
                <Text style={[styles.intervalTab, { color: interval_===iv?colors.primary:colors.mutedForeground, borderBottomColor: interval_===iv?colors.primary:"transparent" }]}>{iv}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View onLayout={e => setChartWidth(e.nativeEvent.layout.width - 8)} style={{ paddingHorizontal: 4 }}>
            <MiniCandleChart candles={candles} width={chartWidth} height={180} />
          </View>
        </View>

        {/* Order Form */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Long/Short */}
          <View style={[styles.sideTabs, { borderBottomColor: colors.border }]}>
            <TouchableOpacity testID="btn-long" onPress={() => { setSide("long"); Haptics.selectionAsync(); }}
              style={[styles.sideTab, { borderBottomColor: side==="long"?colors.success:"transparent", backgroundColor: side==="long"?colors.success+"14":"transparent" }]}>
              <Feather name="trending-up" size={13} color={side==="long"?colors.success:colors.mutedForeground} />
              <Text style={[styles.sideTabText, { color: side==="long"?colors.success:colors.mutedForeground }]}>Long</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="btn-short" onPress={() => { setSide("short"); Haptics.selectionAsync(); }}
              style={[styles.sideTab, { borderBottomColor: side==="short"?colors.destructive:"transparent", backgroundColor: side==="short"?colors.destructive+"14":"transparent" }]}>
              <Feather name="trending-down" size={13} color={side==="short"?colors.destructive:colors.mutedForeground} />
              <Text style={[styles.sideTabText, { color: side==="short"?colors.destructive:colors.mutedForeground }]}>Short</Text>
            </TouchableOpacity>
          </View>

          {/* Type + Leverage */}
          <View style={styles.typeRow}>
            <View style={[styles.typeGroup, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              {(["limit","market","stop"] as const).map(t => (
                <TouchableOpacity key={t} onPress={() => setOrderType(t)}
                  style={[styles.typeBtn, { backgroundColor: orderType===t?colors.accent:"transparent" }]}>
                  <Text style={[styles.typeText, { color: orderType===t?colors.foreground:colors.mutedForeground }]}>
                    {t.charAt(0).toUpperCase()+t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity testID="btn-leverage" onPress={() => setShowLevModal(true)}
              style={[styles.levBtn, { backgroundColor: colors.primary+"22", borderColor: colors.primary }]}>
              <Text style={[styles.levText, { color: colors.primary }]}>{leverage}x</Text>
              <Feather name="chevron-down" size={10} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Info row */}
          <View style={[styles.infoRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            {[
              { l:"Avail Margin", v:`${futuresMargin.toLocaleString(futQuote==="INR"?"en-IN":"en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} ${futQuote}` },
              { l:"Max Open", v:`${Number(maxOpen).toLocaleString(futQuote==="INR"?"en-IN":"en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} ${futQuote}` },
            ].map(r => (
              <View key={r.l} style={styles.infoItem}>
                <Text style={[styles.infoL, { color: colors.mutedForeground }]}>{r.l}</Text>
                <Text style={[styles.infoV, { color: colors.foreground }]}>{r.v}</Text>
              </View>
            ))}
          </View>

          {/* Price */}
          {orderType !== "market" && (
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Price</Text>
              <TextInput testID="input-price" value={price} onChangeText={setPrice} keyboardType="numeric"
                style={[styles.inputField, { color: colors.foreground }]} />
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>USDT</Text>
            </View>
          )}

          {/* Amount */}
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Size</Text>
            <TextInput testID="input-amount" value={amount} onChangeText={setAmount} keyboardType="numeric"
              placeholder="0.0000" placeholderTextColor={colors.mutedForeground}
              style={[styles.inputField, { color: colors.foreground }]} />
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>BTC</Text>
          </View>

          {/* Pct */}
          <View style={styles.pctRow}>
            {[0,25,50,75,100].map(p => (
              <TouchableOpacity key={p} onPress={() => handlePct(p)}
                style={[styles.pctBtn, {
                  borderColor: pct===p?(side==="long"?colors.success:colors.destructive):colors.border,
                  backgroundColor: pct===p?(side==="long"?colors.success:colors.destructive)+"18":"transparent"
                }]}>
                <Text style={[styles.pctText, { color: pct===p?(side==="long"?colors.success:colors.destructive):colors.mutedForeground }]}>{p}%</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Summary */}
          <View style={[styles.summary, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            {[
              { l:"Position Value", v:`${posValue} USDT` },
              { l:"Required Margin", v:`${reqMargin} USDT` },
              { l:"Est. Liq. Price",  v:estLiq==="—"?"—":`$${estLiq}`, danger:true },
              { l:"Max Profit",       v:posValue!=="0.00"?`$${(parseFloat(posValue)*0.15).toFixed(2)}`:"—" },
            ].map(r => (
              <View key={r.l} style={styles.summaryRow}>
                <Text style={[styles.summaryL, { color: colors.mutedForeground }]}>{r.l}</Text>
                <Text style={[styles.summaryV, { color: r.danger?colors.destructive:colors.foreground }]}>{r.v}</Text>
              </View>
            ))}
          </View>

          {/* TP/SL */}
          <TouchableOpacity onPress={() => { setShowTpSl(v=>!v); Haptics.selectionAsync(); }}
            style={[styles.tpslToggle, { borderColor: showTpSl?colors.primary+"60":colors.border }]}>
            <Feather name="target" size={12} color={showTpSl?colors.primary:colors.mutedForeground} />
            <Text style={[styles.tpslToggleTxt, { color: showTpSl?colors.primary:colors.mutedForeground }]}>Take Profit / Stop Loss</Text>
            <Feather name={showTpSl?"chevron-up":"chevron-down"} size={12} color={colors.mutedForeground} />
          </TouchableOpacity>

          {showTpSl && (
            <View style={{ gap:8, marginBottom:8 }}>
              <View style={[styles.inputWrap, { borderColor: colors.success+"60", backgroundColor: colors.secondary }]}>
                <Text style={[styles.inputLabel, { color: colors.success }]}>TP</Text>
                <TextInput value={tpPrice} onChangeText={setTpPrice} keyboardType="numeric"
                  placeholder="Take Profit Price" placeholderTextColor={colors.mutedForeground}
                  style={[styles.inputField, { color: colors.foreground }]} />
                <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>USDT</Text>
              </View>
              <View style={[styles.inputWrap, { borderColor: colors.destructive+"60", backgroundColor: colors.secondary }]}>
                <Text style={[styles.inputLabel, { color: colors.destructive }]}>SL</Text>
                <TextInput value={slPrice} onChangeText={setSlPrice} keyboardType="numeric"
                  placeholder="Stop Loss Price" placeholderTextColor={colors.mutedForeground}
                  style={[styles.inputField, { color: colors.foreground }]} />
                <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>USDT</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            testID="btn-submit-futures"
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)}
            style={[styles.submitBtn, { backgroundColor: side==="long"?colors.success:colors.destructive }]}>
            <Feather name={side==="long"?"trending-up":"trending-down"} size={15} color="#fff" />
            <Text style={styles.submitText}>{side==="long"?"Long / Buy":"Short / Sell"} {leverage}x</Text>
          </TouchableOpacity>
          <Text style={[styles.feeNote, { color: colors.mutedForeground }]}>Maker 0.02% / Taker 0.05%</Text>
        </View>

        {/* Bottom panel */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
            {(["positions","orders","funding","history"] as const).map(t => (
              <TouchableOpacity key={t} onPress={() => setActiveTab(t)}
                style={[styles.bottomTab, { borderBottomColor: activeTab===t?colors.primary:"transparent" }]}>
                <Text style={[styles.bottomTabText, { color: activeTab===t?colors.primary:colors.mutedForeground }]}>
                  {t==="positions"?`Pos (${positions.length})`:t==="orders"?"Orders":t==="funding"?"Funding":"History"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === "positions" && positions.length === 0 && (
            <View style={styles.emptyState}>
              <Feather name="layers" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>No open positions</Text>
            </View>
          )}
          {activeTab === "positions" && positions.length > 0 && (
            <View>
              {positions.map((pos, i) => (
                <View key={i} style={[styles.posCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  <View style={styles.posHeader}>
                    <Text style={[styles.posSymbol, { color: colors.foreground }]}>{pos.symbol}</Text>
                    <View style={[styles.sideBadge, { backgroundColor: (pos.side==="Long"?colors.success:colors.destructive)+"22" }]}>
                      <Text style={[styles.sideBadgeTxt, { color: pos.side==="Long"?colors.success:colors.destructive }]}>
                        {pos.side} {pos.leverage}x
                      </Text>
                    </View>
                    <View style={[styles.modeBadge, { backgroundColor: colors.accent }]}>
                      <Text style={[styles.modeBadgeTxt, { color: colors.mutedForeground }]}>{pos.marginMode}</Text>
                    </View>
                    <View style={styles.pnlBlock}>
                      <Text style={[styles.posPnl, { color: colors.success }]}>{pos.pnl}</Text>
                      <Text style={[styles.posPnlPct, { color: colors.success }]}>{pos.roe}</Text>
                    </View>
                  </View>
                  <View style={styles.posGrid}>
                    {[
                      ["Size", pos.size], ["Entry", pos.entry], ["Mark", pos.markPrice],
                      ["Liq.", pos.liqPrice], ["Margin", pos.margin], ["ROE%", pos.roe],
                    ].map(([l,v]) => (
                      <View key={l} style={styles.posItem}>
                        <Text style={[styles.posL, { color: colors.mutedForeground }]}>{l}</Text>
                        <Text style={[styles.posV, { color: l==="Liq."?colors.destructive:l==="ROE%"?colors.success:colors.foreground }]}>{v}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.adlRow}>
                    <Text style={[styles.adlLabel, { color: colors.mutedForeground }]}>ADL</Text>
                    <ADLBar level={pos.adl} />
                  </View>
                  <View style={styles.posActions}>
                    <TouchableOpacity style={[styles.closeBtn, { borderColor: colors.destructive, backgroundColor: colors.destructive+"12" }]}
                      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}>
                      <Text style={[styles.closeBtnTxt, { color: colors.destructive }]}>Close</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.tpslBtn, { borderColor: colors.success+"80", backgroundColor: colors.success+"10" }]}>
                      <Text style={[styles.tpslBtnTxt, { color: colors.success }]}>TP/SL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.addBtn, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                      <Text style={[styles.addBtnTxt, { color: colors.foreground }]}>Add Margin</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={[styles.closeAllBtn, { borderColor: colors.destructive }]}>
                <Feather name="x-circle" size={13} color={colors.destructive} />
                <Text style={[styles.closeAllTxt, { color: colors.destructive }]}>Close All ({positions.length})</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === "orders" && (
            <View style={styles.emptyState}>
              <Feather name="list" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>No open orders</Text>
            </View>
          )}

          {activeTab === "funding" && (
            <View>
              <View style={[styles.fundHeader, { borderBottomColor: colors.border }]}>
                {["Time","Rate","Cost"].map(h => (
                  <Text key={h} style={[styles.fundHeaderTxt, { color: colors.mutedForeground }]}>{h}</Text>
                ))}
              </View>
              {FUNDING_HISTORY.map((f, i) => (
                <View key={i} style={[styles.fundRow, { borderTopColor: colors.border, borderTopWidth: i>0?1:0 }]}>
                  <Text style={[styles.fundTime, { color: colors.mutedForeground }]}>{f.time}</Text>
                  <Text style={[styles.fundRate, { color: f.color }]}>{f.rate}</Text>
                  <Text style={[styles.fundCost, { color: f.color }]}>{f.cost}</Text>
                </View>
              ))}
            </View>
          )}

          {activeTab === "history" && (
            <View style={styles.emptyState}>
              <Feather name="clock" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>No recent history</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Pair Modal */}
      <Modal visible={showPairModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Contract</Text>
            {futPairs.length === 0 && (
              <Text style={{ color: colors.mutedForeground, textAlign: "center", padding: 20 }}>
                No futures contracts enabled. Please enable from admin.
              </Text>
            )}
            {futPairs.map(p => (
              <TouchableOpacity key={p.label} onPress={() => { setSelectedPair(p); setCurrentPrice(p.base); setShowPairModal(false); Haptics.selectionAsync(); }}
                style={[styles.pairOpt, { borderTopColor: colors.border, backgroundColor: selectedPair.label===p.label?colors.secondary:"transparent" }]}>
                <View style={[styles.pairOptDot, { backgroundColor: p.color }]} />
                <View style={{ flex:1 }}>
                  <Text style={[styles.pairOptTxt, { color: selectedPair.label===p.label?colors.primary:colors.foreground }]}>{p.label}</Text>
                  {(() => {
                    const pq = (p.label || "").split("/")[1] || "USDT";
                    const ps = pq === "INR" ? "₹" : "$";
                    const loc = pq === "INR" ? "en-IN" : "en-US";
                    return <Text style={[styles.pairOptPrice, { color: colors.mutedForeground }]}>{ps}{p.base.toLocaleString(loc,{minimumFractionDigits:2})}</Text>;
                  })()}
                </View>
                <Text style={[styles.pairOptChange, { color: p.change>=0?colors.success:colors.destructive }]}>
                  {p.change>=0?"+":""}{p.change}%
                </Text>
                {selectedPair.label===p.label && <Feather name="check" size={15} color={colors.primary} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowPairModal(false)} style={[styles.cancelModal, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.cancelModalTxt, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Leverage Modal */}
      <Modal visible={showLevModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Adjust Leverage</Text>
            <View style={[styles.levDisplay, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.levDisplayText, { color: colors.primary }]}>{leverage}x</Text>
            </View>
            <View style={styles.levGrid}>
              {LEVERAGES.map(l => (
                <TouchableOpacity key={l} testID={`leverage-${l}`} onPress={() => { setLeverage(l); setShowLevModal(false); Haptics.selectionAsync(); }}
                  style={[styles.levOption, {
                    backgroundColor: leverage===l?colors.primary+"22":colors.secondary,
                    borderColor: leverage===l?colors.primary:colors.border
                  }]}>
                  <Text style={[styles.levOptionText, { color: leverage===l?colors.primary:colors.foreground }]}>{l}x</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.levRiskRow, { backgroundColor: colors.secondary+"80" }]}>
              <Feather name="alert-triangle" size={12} color="#fcd535" />
              <Text style={[styles.levRiskText, { color: colors.mutedForeground }]}>
                Max position at {leverage}x: {maxOpen} USDT
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowLevModal(false)} style={[styles.cancelModal, { backgroundColor: colors.secondary, marginTop:12 }]}>
              <Text style={[styles.cancelModalTxt, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1 },
  header: { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:14, paddingBottom:10, borderBottomWidth:1 },
  pairBtn: { flexDirection:"row", alignItems:"center", gap:6 },
  pairDot: { width:8, height:8, borderRadius:4 },
  pairText: { fontSize:14, fontFamily:"Inter_700Bold" },
  headerCenter: { alignItems:"center" },
  mainPrice: { fontSize:20, fontFamily:"Inter_700Bold" },
  priceChange: { fontSize:10, fontFamily:"Inter_500Medium" },
  marginModeBtn: { flexDirection:"row", alignItems:"center", gap:4, borderWidth:1, borderRadius:8, paddingHorizontal:8, paddingVertical:4 },
  marginModeText: { fontSize:10, fontFamily:"Inter_700Bold" },
  statsBar: { flexDirection:"row", paddingHorizontal:10, paddingVertical:7, borderBottomWidth:1 },
  statItem: { flex:1, alignItems:"center" },
  statL: { fontSize:8.5, fontFamily:"Inter_400Regular", marginBottom:1 },
  statV: { fontSize:10, fontFamily:"Inter_600SemiBold" },
  chartWrap: { margin:8, borderRadius:14, borderWidth:1, overflow:"hidden" },
  intervalRow: { flexDirection:"row", paddingHorizontal:12, paddingVertical:8, gap:4, borderBottomWidth:1, borderBottomColor:"#2b2f36" },
  intervalTab: { paddingHorizontal:10, paddingVertical:5, fontSize:11, fontFamily:"Inter_600SemiBold", borderBottomWidth:2 },
  card: { margin:8, borderRadius:14, borderWidth:1, padding:12 },
  sideTabs: { flexDirection:"row", borderBottomWidth:1, marginBottom:12 },
  sideTab: { flex:1, flexDirection:"row", alignItems:"center", justifyContent:"center", paddingVertical:10, borderBottomWidth:2, gap:5 },
  sideTabText: { fontSize:13, fontFamily:"Inter_700Bold" },
  typeRow: { flexDirection:"row", alignItems:"center", gap:8, marginBottom:10 },
  typeGroup: { flex:1, flexDirection:"row", borderRadius:8, overflow:"hidden", borderWidth:1 },
  typeBtn: { flex:1, paddingVertical:6, alignItems:"center" },
  typeText: { fontSize:11, fontFamily:"Inter_600SemiBold" },
  levBtn: { flexDirection:"row", alignItems:"center", gap:3, paddingHorizontal:12, paddingVertical:7, borderRadius:8, borderWidth:1 },
  levText: { fontSize:13, fontFamily:"Inter_700Bold" },
  infoRow: { flexDirection:"row", borderRadius:8, borderWidth:1, paddingVertical:8, marginBottom:10 },
  infoItem: { flex:1, alignItems:"center" },
  infoL: { fontSize:9, fontFamily:"Inter_400Regular", marginBottom:2 },
  infoV: { fontSize:10, fontFamily:"Inter_600SemiBold" },
  inputWrap: { flexDirection:"row", alignItems:"center", borderRadius:8, borderWidth:1, paddingHorizontal:12, paddingVertical:10, marginBottom:8 },
  inputLabel: { fontSize:11, fontFamily:"Inter_500Medium", flex:1 },
  inputField: { flex:1, fontSize:13, fontFamily:"Inter_600SemiBold", textAlign:"right", padding:0 },
  pctRow: { flexDirection:"row", gap:6, marginBottom:10 },
  pctBtn: { flex:1, paddingVertical:5, borderRadius:6, borderWidth:1, alignItems:"center" },
  pctText: { fontSize:9.5, fontFamily:"Inter_600SemiBold" },
  summary: { borderRadius:10, borderWidth:1, padding:10, marginBottom:10 },
  summaryRow: { flexDirection:"row", justifyContent:"space-between", paddingVertical:3 },
  summaryL: { fontSize:11, fontFamily:"Inter_400Regular" },
  summaryV: { fontSize:11, fontFamily:"Inter_600SemiBold" },
  tpslToggle: { flexDirection:"row", alignItems:"center", gap:6, borderWidth:1, borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8 },
  tpslToggleTxt: { flex:1, fontSize:11, fontFamily:"Inter_600SemiBold" },
  submitBtn: { flexDirection:"row", borderRadius:10, paddingVertical:14, alignItems:"center", justifyContent:"center", gap:6, marginBottom:6 },
  submitText: { fontSize:14, fontFamily:"Inter_700Bold", color:"#fff" },
  feeNote: { fontSize:10, fontFamily:"Inter_400Regular", textAlign:"center" },
  tabRow: { flexDirection:"row", borderBottomWidth:1, marginBottom:12 },
  bottomTab: { flex:1, paddingVertical:10, alignItems:"center", borderBottomWidth:2 },
  bottomTabText: { fontSize:11, fontFamily:"Inter_600SemiBold" },
  posCard: { borderRadius:10, borderWidth:1, padding:10, marginBottom:8 },
  posHeader: { flexDirection:"row", alignItems:"center", gap:6, marginBottom:8, flexWrap:"wrap" },
  posSymbol: { fontSize:13, fontFamily:"Inter_700Bold" },
  sideBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:5 },
  sideBadgeTxt: { fontSize:10, fontFamily:"Inter_700Bold" },
  modeBadge: { paddingHorizontal:6, paddingVertical:2, borderRadius:4 },
  modeBadgeTxt: { fontSize:9, fontFamily:"Inter_500Medium" },
  pnlBlock: { marginLeft:"auto", alignItems:"flex-end" },
  posPnl: { fontSize:12, fontFamily:"Inter_700Bold" },
  posPnlPct: { fontSize:10, fontFamily:"Inter_500Medium" },
  posGrid: { flexDirection:"row", flexWrap:"wrap", gap:4, marginBottom:6 },
  posItem: { width:"30%", marginBottom:4 },
  posL: { fontSize:9, fontFamily:"Inter_400Regular" },
  posV: { fontSize:11, fontFamily:"Inter_600SemiBold" },
  adlRow: { flexDirection:"row", alignItems:"center", gap:8, marginBottom:8 },
  adlLabel: { fontSize:9, fontFamily:"Inter_400Regular" },
  posActions: { flexDirection:"row", gap:6 },
  closeBtn: { flex:1, borderWidth:1, borderRadius:8, paddingVertical:7, alignItems:"center" },
  closeBtnTxt: { fontSize:12, fontFamily:"Inter_700Bold" },
  tpslBtn: { flex:1, borderWidth:1, borderRadius:8, paddingVertical:7, alignItems:"center" },
  tpslBtnTxt: { fontSize:12, fontFamily:"Inter_600SemiBold" },
  addBtn: { flex:1, borderWidth:1, borderRadius:8, paddingVertical:7, alignItems:"center" },
  addBtnTxt: { fontSize:11, fontFamily:"Inter_600SemiBold" },
  closeAllBtn: { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:6, borderWidth:1, borderColor:"#f6465d", borderRadius:8, paddingVertical:8, marginTop:4 },
  closeAllTxt: { fontSize:12, fontFamily:"Inter_600SemiBold" },
  emptyState: { alignItems:"center", paddingVertical:32, gap:8 },
  emptyTxt: { fontSize:13, fontFamily:"Inter_400Regular" },
  fundHeader: { flexDirection:"row", paddingVertical:8, borderBottomWidth:1 },
  fundHeaderTxt: { flex:1, fontSize:10, fontFamily:"Inter_500Medium" },
  fundRow: { flexDirection:"row", paddingVertical:10 },
  fundTime: { flex:1.5, fontSize:10, fontFamily:"Inter_400Regular" },
  fundRate: { flex:1, fontSize:11, fontFamily:"Inter_600SemiBold" },
  fundCost: { flex:1, fontSize:11, fontFamily:"Inter_600SemiBold", textAlign:"right" },
  modalOverlay: { flex:1, justifyContent:"flex-end", backgroundColor:"#00000088" },
  modalSheet: { borderTopLeftRadius:20, borderTopRightRadius:20, borderWidth:1, padding:16, paddingBottom:32 },
  handle: { width:40, height:4, borderRadius:2, alignSelf:"center", marginBottom:14 },
  modalTitle: { fontSize:16, fontFamily:"Inter_700Bold", marginBottom:14 },
  pairOpt: { flexDirection:"row", alignItems:"center", paddingVertical:12, borderTopWidth:1, gap:10 },
  pairOptDot: { width:10, height:10, borderRadius:5 },
  pairOptTxt: { fontSize:13, fontFamily:"Inter_600SemiBold" },
  pairOptPrice: { fontSize:11, fontFamily:"Inter_400Regular" },
  pairOptChange: { fontSize:12, fontFamily:"Inter_600SemiBold", minWidth:50, textAlign:"right" },
  cancelModal: { borderRadius:12, paddingVertical:14, alignItems:"center" },
  cancelModalTxt: { fontSize:14, fontFamily:"Inter_600SemiBold" },
  levDisplay: { alignItems:"center", paddingVertical:16, borderRadius:10, borderWidth:1, marginBottom:12 },
  levDisplayText: { fontSize:28, fontFamily:"Inter_700Bold" },
  levGrid: { flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:12 },
  levOption: { width:"22%", paddingVertical:10, borderRadius:8, borderWidth:1, alignItems:"center" },
  levOptionText: { fontSize:12, fontFamily:"Inter_700Bold" },
  levRiskRow: { flexDirection:"row", alignItems:"center", gap:6, padding:10, borderRadius:8 },
  levRiskText: { fontSize:11, fontFamily:"Inter_400Regular" },
} as any);
