import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, Modal, TextInput
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { walletApi } from "@/lib/api";

const COIN_COLORS: Record<string, string> = {
  USDT:"#26A17B", BTC:"#F7931A", ETH:"#627EEA", BNB:"#F3BA2F",
  SOL:"#9945FF", XRP:"#00AAE4", ADA:"#0033AD", DOGE:"#C2A633",
  INR:"#0ecb81",
};

const CHART_DATA = [28500, 29100, 27800, 30200, 29600, 31400, 29220];
const CHART_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const TX_ICONS: Record<string,string> = { deposit:"download", withdraw:"upload", buy:"shopping-cart", sell:"tag", transfer:"repeat" };
const TX_COLORS: Record<string,string> = { deposit:"#0ecb81", withdraw:"#f6465d", buy:"#fcd535", sell:"#f6465d", transfer:"#627EEA" };

function fmtAmt(n: number) {
  if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return n.toFixed(6);
}
function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function adaptBalances(rows: any[], type: string) {
  const filtered = rows.filter(r => r.walletType === type);
  const total = filtered.reduce((s, r) => s + Number(r.usdValue ?? 0), 0);
  return filtered.map(r => {
    const pct = total > 0 ? (Number(r.usdValue) / total) * 100 : 0;
    return {
      symbol: r.currency, name: r.name, amount: fmtAmt(Number(r.balance)),
      value: fmtMoney(Number(r.usdValue ?? 0)), avail: fmtAmt(Number(r.available ?? 0)),
      locked: fmtAmt(Number(r.locked ?? 0)), pct, change: 0,
      color: COIN_COLORS[r.currency] ?? "#888", apy: "—",
    };
  });
}

function BalanceChart({ data, colors }: { data: number[]; colors: any }) {
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const w = 280, h = 70;
  const segW = w / (data.length - 1);
  return (
    <View style={{ width: w, height: h, overflow:"hidden", marginTop: 8 }}>
      {/* Grid */}
      {[0,1,2].map(i => (
        <View key={i} style={{ position:"absolute", left:0, right:0, top:(i/2)*h, height:1, backgroundColor:"#2b2f3630" }} />
      ))}
      {/* Area fill */}
      {data.map((v, i) => {
        if(i===data.length-1) return null;
        const y1 = h - ((v-min)/range)*(h-8)-4;
        const y2 = h - ((data[i+1]-min)/range)*(h-8)-4;
        const x1 = i * segW, x2 = (i+1)*segW;
        const len = Math.sqrt((x2-x1)**2+(y2-y1)**2);
        const angle = Math.atan2(y2-y1,x2-x1)*(180/Math.PI);
        return (
          <View key={i}>
            <View style={{ position:"absolute", left:x1, top:Math.min(y1,y2), width:len, height:2,
              backgroundColor:"#fcd535", transform:[{rotate:`${angle}deg`}], transformOrigin:"0 50%",
            } as any} />
            <View style={{ position:"absolute", left:x1, top:y1, width:segW, height:h-y1,
              backgroundColor:"#fcd53514" }} />
          </View>
        );
      })}
      {/* Dots */}
      {data.map((v,i) => {
        const x = i*segW - 3;
        const y = h - ((v-min)/range)*(h-8)-4 - 3;
        return <View key={`d${i}`} style={{ position:"absolute", left:x, top:y, width:6, height:6, borderRadius:3, backgroundColor:"#fcd535", borderWidth:2, borderColor:"#161a1e" }} />;
      })}
    </View>
  );
}

function DonutChart({ data, colors: c }: { data: typeof SPOT_ASSETS; colors: any }) {
  const total = data.reduce((s, a) => s + a.pct, 0);
  const size = 130, cx = size/2, cy = size/2, r = 45, stroke = 20;
  let start = -Math.PI / 2;
  const segments = data.map(a => {
    const sweep = (a.pct/total) * 2 * Math.PI;
    const end = start + sweep;
    const x1 = cx + (r+stroke/2) * Math.cos(start);
    const y1 = cy + (r+stroke/2) * Math.sin(start);
    const x2 = cx + (r+stroke/2) * Math.cos(end);
    const y2 = cy + (r+stroke/2) * Math.sin(end);
    const midAngle = start + sweep/2;
    const dotX = cx + (r+stroke+12) * Math.cos(midAngle);
    const dotY = cy + (r+stroke+12) * Math.sin(midAngle);
    const seg = { a, start, end, sweep, dotX, dotY };
    start = end;
    return seg;
  });
  return (
    <View style={{ width:size, height:size, position:"relative" }}>
      {segments.map(s => (
        <View key={s.a.symbol} style={{
          position:"absolute",
          width:6, height:6, borderRadius:3,
          backgroundColor: s.a.color,
          left: s.dotX - 3, top: s.dotY - 3,
        }} />
      ))}
      <View style={{
        position:"absolute",
        top: cy-r-stroke/2, left: cx-r-stroke/2,
        width: (r+stroke/2)*2, height: (r+stroke/2)*2,
        borderRadius: r+stroke/2,
        borderWidth: stroke,
        borderColor: "#1e2329",
      }} />
      <View style={[StyleSheet.absoluteFill, { alignItems:"center", justifyContent:"center" }]}>
        <Text style={{ fontSize:10, fontFamily:"Inter_400Regular", color:"#848e9c" }}>Total</Text>
        <Text style={{ fontSize:12, fontFamily:"Inter_700Bold", color:"#eaecef" }}>$38.3K</Text>
      </View>
    </View>
  );
}

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [hideBalance, setHideBalance] = useState(false);
  const [walletTab, setWalletTab] = useState<"spot"|"futures"|"earn">("spot");
  const [listTab, setListTab] = useState<"assets"|"txs">("assets");
  const [chartPeriod, setChartPeriod] = useState<"7D"|"1M"|"3M">("7D");
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [allBalances, setAllBalances] = useState<any[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await walletApi.getBalances();
        if (alive) { setAllBalances(r.balances); setTotalUsd(r.totalUsd); }
      } catch { /* guest mode: keep zero */ }
    };
    load();
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const SPOT_ASSETS = adaptBalances(allBalances, "spot");
  const FUTURES_ASSETS = adaptBalances(allBalances, "futures");
  const EARN_ASSETS = adaptBalances(allBalances, "earn");
  const TXS: any[] = [];
  const TOTAL_SPOT = SPOT_ASSETS.reduce((s, a) => s + Number(String(a.value).replace(/,/g,"")), 0);
  const TOTAL_FUTURES = FUTURES_ASSETS.reduce((s, a) => s + Number(String(a.value).replace(/,/g,"")), 0);
  const TOTAL_EARN = EARN_ASSETS.reduce((s, a) => s + Number(String(a.value).replace(/,/g,"")), 0);
  const TOTAL_ALL = totalUsd || (TOTAL_SPOT + TOTAL_FUTURES + TOTAL_EARN);
  const DAILY_PNL = 0;
  const DAILY_PCT = 0;
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;
  const balance = walletTab === "spot" ? TOTAL_SPOT : walletTab === "futures" ? TOTAL_FUTURES : TOTAL_EARN;
  const fmt = (v: number) => v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Platform.OS==="web" ? bottomPad+84 : 90 }}>

        {/* Header */}
        <View style={[styles.headerCard, { paddingTop: topPad+12, backgroundColor: colors.card }]}>
          <View style={styles.headerTop}>
            <View>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>My Assets</Text>
              <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Total portfolio value</Text>
            </View>
            <View style={styles.headerBtns}>
              <TouchableOpacity onPress={() => { setHideBalance(v=>!v); Haptics.selectionAsync(); }}
                style={[styles.iconBtn, { backgroundColor: colors.secondary }]}>
                <Feather name={hideBalance?"eye-off":"eye"} size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.secondary }]}>
                <Feather name="clock" size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.totalBalance, { color: colors.foreground }]}>
            {hideBalance ? "$ ••••••" : `$${fmt(TOTAL_ALL)}`}
          </Text>
          <View style={styles.pnlRow}>
            <Feather name={DAILY_PNL>=0?"trending-up":"trending-down"} size={14} color={DAILY_PNL>=0?colors.success:colors.destructive} />
            <Text style={[styles.pnlText, { color: DAILY_PNL>=0?colors.success:colors.destructive }]}>
              {DAILY_PNL>=0?"+":""}{fmt(DAILY_PNL)} ({DAILY_PCT>=0?"+":""}{DAILY_PCT.toFixed(2)}%) today
            </Text>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            {[
              { icon:"download", label:"Deposit",   action: () => { setShowDepositModal(true); Haptics.selectionAsync(); } },
              { icon:"upload",   label:"Withdraw",  action: () => { setShowWithdrawModal(true); Haptics.selectionAsync(); } },
              { icon:"repeat",   label:"Transfer",  action: () => Haptics.selectionAsync() },
              { icon:"shopping-cart", label:"Buy",  action: () => Haptics.selectionAsync() },
              { icon:"gift",     label:"Earn",      action: () => Haptics.selectionAsync() },
            ].map(a => (
              <TouchableOpacity key={a.label} onPress={a.action} style={styles.actionBtn}>
                <View style={[styles.actionIcon, { backgroundColor: colors.secondary }]}>
                  <Feather name={a.icon as any} size={17} color={colors.primary} />
                </View>
                <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Wallet sub-tabs */}
        <View style={[styles.subTabRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { key:"spot",    label:"Spot",    value:fmt(TOTAL_SPOT) },
            { key:"futures", label:"Futures", value:fmt(TOTAL_FUTURES) },
            { key:"earn",    label:"Earn",    value:fmt(TOTAL_EARN) },
          ].map(t => (
            <TouchableOpacity key={t.key} onPress={() => setWalletTab(t.key as any)}
              style={[styles.subTab, { borderBottomColor: walletTab===t.key?colors.primary:"transparent", backgroundColor: walletTab===t.key?colors.primary+"10":"transparent" }]}>
              <Text style={[styles.subTabLabel, { color: walletTab===t.key?colors.primary:colors.mutedForeground }]}>{t.label}</Text>
              <Text style={[styles.subTabValue, { color: walletTab===t.key?colors.foreground:colors.mutedForeground }]}>
                {hideBalance?"••••":t.value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Balance chart */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={[styles.chartBalance, { color: colors.foreground }]}>
                {hideBalance ? "••••••" : `$${fmt(balance)}`}
              </Text>
              <Text style={[styles.chartSub, { color: colors.success }]}>+$247.35 (0.85%) this week</Text>
            </View>
            <View style={styles.periodRow}>
              {(["7D","1M","3M"] as const).map(p => (
                <TouchableOpacity key={p} onPress={() => setChartPeriod(p)}
                  style={[styles.periodBtn, { backgroundColor: chartPeriod===p?colors.primary+"22":"transparent", borderColor: chartPeriod===p?colors.primary:colors.border }]}>
                  <Text style={[styles.periodText, { color: chartPeriod===p?colors.primary:colors.mutedForeground }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <BalanceChart data={CHART_DATA} colors={colors} />
          {/* X axis */}
          <View style={{ flexDirection:"row", justifyContent:"space-between", marginTop:4, paddingHorizontal:2 }}>
            {CHART_DAYS.map(d => (
              <Text key={d} style={{ fontSize:9, fontFamily:"Inter_400Regular", color:colors.mutedForeground }}>{d}</Text>
            ))}
          </View>
        </View>

        {/* Allocation + Legend */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.allocHeader}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Allocation</Text>
            <Text style={[styles.allocTotal, { color: colors.mutedForeground }]}>
              Total: ${hideBalance ? "••••" : fmt(TOTAL_ALL)}
            </Text>
          </View>
          <View style={styles.allocRow}>
            <DonutChart data={SPOT_ASSETS} colors={colors} />
            <View style={styles.legendCol}>
              {SPOT_ASSETS.map(a => (
                <View key={a.symbol} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: a.color }]} />
                  <Text style={[styles.legendSym, { color: colors.foreground }]}>{a.symbol}</Text>
                  <View style={{ flex:1 }}>
                    <View style={[styles.allocBar, { backgroundColor: colors.border }]}>
                      <View style={[styles.allocBarFill, { backgroundColor: a.color, width:`${a.pct}%` as any }]} />
                    </View>
                  </View>
                  <Text style={[styles.legendPct, { color: colors.mutedForeground }]}>{a.pct}%</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Assets / Transactions tabs */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setListTab("assets")}
              style={[styles.tab, { borderBottomColor: listTab==="assets"?colors.primary:"transparent" }]}>
              <Text style={[styles.tabText, { color: listTab==="assets"?colors.primary:colors.mutedForeground }]}>Assets</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setListTab("txs")}
              style={[styles.tab, { borderBottomColor: listTab==="txs"?colors.primary:"transparent" }]}>
              <Text style={[styles.tabText, { color: listTab==="txs"?colors.primary:colors.mutedForeground }]}>Transactions</Text>
            </TouchableOpacity>
          </View>

          {listTab === "assets" && walletTab !== "earn" && (
            <View>
              {(walletTab === "spot" ? SPOT_ASSETS : FUTURES_ASSETS).map((a, i) => (
                <View key={a.symbol} style={[styles.assetRow, { borderTopColor: colors.border, borderTopWidth: i>0?1:0 }]}>
                  <View style={[styles.assetLogo, { backgroundColor: a.color+"22" }]}>
                    <Text style={[styles.assetLogoTxt, { color: a.color }]}>{a.symbol[0]}</Text>
                  </View>
                  <View style={styles.assetInfo}>
                    <Text style={[styles.assetSym, { color: colors.foreground }]}>{a.symbol}</Text>
                    <Text style={[styles.assetName, { color: colors.mutedForeground }]}>{a.name}</Text>
                    <View style={styles.assetAvailRow}>
                      <Text style={[styles.assetAvail, { color: colors.mutedForeground }]}>Avail: {hideBalance?"••••":a.avail}</Text>
                      {parseFloat(a.locked) > 0 && (
                        <View style={[styles.lockBadge, { backgroundColor: colors.primary+"18" }]}>
                          <Feather name="lock" size={8} color={colors.primary} />
                          <Text style={[styles.lockTxt, { color: colors.primary }]}>{hideBalance?"••":a.locked}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={{ alignItems:"flex-end" }}>
                    <Text style={[styles.assetAmt, { color: colors.foreground }]}>{hideBalance?"••••":a.amount}</Text>
                    <Text style={[styles.assetVal, { color: colors.mutedForeground }]}>${hideBalance?"••••":a.value}</Text>
                    <Text style={[styles.assetChange, { color: a.change>=0?colors.success:colors.destructive }]}>
                      {a.change>=0?"+":""}{a.change.toFixed(2)}%
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {listTab === "assets" && walletTab === "earn" && (
            <View>
              {EARN_ASSETS.map((a,i) => (
                <View key={a.symbol} style={[styles.assetRow, { borderTopColor: colors.border, borderTopWidth: i>0?1:0 }]}>
                  <View style={[styles.assetLogo, { backgroundColor: a.color+"22" }]}>
                    <Text style={[styles.assetLogoTxt, { color: a.color }]}>{a.symbol[0]}</Text>
                  </View>
                  <View style={styles.assetInfo}>
                    <Text style={[styles.assetSym, { color: colors.foreground }]}>{a.symbol}</Text>
                    <Text style={[styles.assetName, { color: colors.mutedForeground }]}>{a.name}</Text>
                    <View style={[styles.apyBadge, { backgroundColor: colors.success+"18" }]}>
                      <Text style={[styles.apyTxt, { color: colors.success }]}>{a.apy}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems:"flex-end" }}>
                    <Text style={[styles.assetAmt, { color: colors.foreground }]}>{a.amount}</Text>
                    <Text style={[styles.assetVal, { color: colors.mutedForeground }]}>${a.value}</Text>
                    <TouchableOpacity style={[styles.redeemBtn, { borderColor: colors.primary }]}>
                      <Text style={[styles.redeemTxt, { color: colors.primary }]}>Redeem</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {listTab === "txs" && (
            <View>
              {TXS.map((tx, i) => (
                <View key={i} style={[styles.txRow, { borderTopColor: colors.border, borderTopWidth: i>0?1:0 }]}>
                  <View style={[styles.txIcon, { backgroundColor: TX_COLORS[tx.type]+"22" }]}>
                    <Feather name={TX_ICONS[tx.type] as any} size={15} color={TX_COLORS[tx.type]} />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={[styles.txType, { color: colors.foreground }]}>
                      {tx.type.charAt(0).toUpperCase()+tx.type.slice(1)} {tx.asset}
                    </Text>
                    <Text style={[styles.txTime, { color: colors.mutedForeground }]}>{tx.time}</Text>
                    {tx.hash !== "" && (
                      <Text style={[styles.txHash, { color: colors.mutedForeground }]}>{tx.hash}</Text>
                    )}
                  </View>
                  <View style={{ alignItems:"flex-end" }}>
                    <Text style={[styles.txAmount, { color: tx.amount.startsWith("+") ? colors.success : tx.amount.startsWith("-") ? colors.destructive : colors.foreground }]}>
                      {tx.amount}
                    </Text>
                    <View style={[styles.txStatus, { backgroundColor: colors.success+"18" }]}>
                      <View style={[styles.txDot, { backgroundColor: colors.success }]} />
                      <Text style={[styles.txStatusTxt, { color: colors.success }]}>{tx.status}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Deposit Modal */}
      <Modal visible={showDepositModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Deposit</Text>
            {["USDT","BTC","ETH","BNB"].map((asset,i) => (
              <TouchableOpacity key={asset} onPress={() => { setShowDepositModal(false); Haptics.selectionAsync(); }}
                style={[styles.assetOpt, { borderTopColor: colors.border, borderTopWidth: i>0?1:0 }]}>
                <Text style={[styles.assetOptTxt, { color: colors.foreground }]}>{asset}</Text>
                <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowDepositModal(false)} style={[styles.cancelModal, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.cancelModalTxt, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Withdraw Modal */}
      <Modal visible={showWithdrawModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Withdraw</Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Address</Text>
              <TextInput placeholder="Wallet address" placeholderTextColor={colors.mutedForeground}
                style={[styles.inputField, { color: colors.foreground }]} />
            </View>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Amount</Text>
              <TextInput placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="numeric"
                style={[styles.inputField, { color: colors.foreground }]} />
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>USDT</Text>
            </View>
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]}>
              <Text style={[styles.submitTxt, { color: "#000" }]}>Confirm Withdrawal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowWithdrawModal(false)} style={[styles.cancelModal, { backgroundColor: colors.secondary }]}>
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
  headerCard: { paddingHorizontal:20, paddingBottom:20 },
  headerTop: { flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 },
  headerTitle: { fontSize:20, fontFamily:"Inter_700Bold" },
  headerSub: { fontSize:11, fontFamily:"Inter_400Regular", marginTop:2 },
  headerBtns: { flexDirection:"row", gap:8 },
  iconBtn: { width:34, height:34, borderRadius:17, alignItems:"center", justifyContent:"center" },
  totalBalance: { fontSize:36, fontFamily:"Inter_700Bold", marginBottom:4 },
  pnlRow: { flexDirection:"row", alignItems:"center", gap:5, marginBottom:20 },
  pnlText: { fontSize:13, fontFamily:"Inter_500Medium" },
  actionRow: { flexDirection:"row", justifyContent:"space-between" },
  actionBtn: { alignItems:"center", gap:5 },
  actionIcon: { width:50, height:50, borderRadius:25, alignItems:"center", justifyContent:"center" },
  actionLabel: { fontSize:10, fontFamily:"Inter_500Medium" },
  subTabRow: { flexDirection:"row", borderBottomWidth:1, marginHorizontal:8, borderRadius:12, overflow:"hidden", marginBottom:4 },
  subTab: { flex:1, alignItems:"center", paddingVertical:12, borderBottomWidth:2 },
  subTabLabel: { fontSize:11, fontFamily:"Inter_600SemiBold" },
  subTabValue: { fontSize:12, fontFamily:"Inter_700Bold", marginTop:2 },
  card: { margin:8, borderRadius:14, borderWidth:1, padding:14 },
  chartHeader: { flexDirection:"row", alignItems:"flex-start", justifyContent:"space-between" },
  chartBalance: { fontSize:22, fontFamily:"Inter_700Bold" },
  chartSub: { fontSize:11, fontFamily:"Inter_500Medium", marginTop:2 },
  periodRow: { flexDirection:"row", gap:4 },
  periodBtn: { paddingHorizontal:8, paddingVertical:3, borderRadius:6, borderWidth:1 },
  periodText: { fontSize:10, fontFamily:"Inter_600SemiBold" },
  allocHeader: { flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:12 },
  cardTitle: { fontSize:14, fontFamily:"Inter_600SemiBold" },
  allocTotal: { fontSize:11, fontFamily:"Inter_400Regular" },
  allocRow: { flexDirection:"row", alignItems:"center", gap:12 },
  legendCol: { flex:1, gap:8 },
  legendItem: { flexDirection:"row", alignItems:"center", gap:6 },
  legendDot: { width:8, height:8, borderRadius:4, flexShrink:0 },
  legendSym: { width:40, fontSize:12, fontFamily:"Inter_600SemiBold" },
  allocBar: { height:4, borderRadius:2, overflow:"hidden" },
  allocBarFill: { height:4, borderRadius:2 },
  legendPct: { fontSize:11, fontFamily:"Inter_500Medium", minWidth:32, textAlign:"right" },
  tabRow: { flexDirection:"row", borderBottomWidth:1, marginBottom:12 },
  tab: { flex:1, paddingVertical:10, alignItems:"center", borderBottomWidth:2 },
  tabText: { fontSize:13, fontFamily:"Inter_600SemiBold" },
  assetRow: { flexDirection:"row", alignItems:"flex-start", paddingVertical:12, gap:10 },
  assetLogo: { width:40, height:40, borderRadius:20, alignItems:"center", justifyContent:"center" },
  assetLogoTxt: { fontSize:16, fontFamily:"Inter_700Bold" },
  assetInfo: { flex:1 },
  assetSym: { fontSize:13, fontFamily:"Inter_600SemiBold" },
  assetName: { fontSize:10, fontFamily:"Inter_400Regular", marginTop:2 },
  assetAvailRow: { flexDirection:"row", alignItems:"center", gap:6, marginTop:3 },
  assetAvail: { fontSize:9.5, fontFamily:"Inter_400Regular" },
  lockBadge: { flexDirection:"row", alignItems:"center", gap:3, paddingHorizontal:5, paddingVertical:2, borderRadius:4 },
  lockTxt: { fontSize:9, fontFamily:"Inter_600SemiBold" },
  assetAmt: { fontSize:13, fontFamily:"Inter_600SemiBold" },
  assetVal: { fontSize:10, fontFamily:"Inter_400Regular", marginTop:2 },
  assetChange: { fontSize:10, fontFamily:"Inter_600SemiBold", marginTop:2 },
  apyBadge: { paddingHorizontal:6, paddingVertical:2, borderRadius:5, marginTop:4, alignSelf:"flex-start" },
  apyTxt: { fontSize:10, fontFamily:"Inter_700Bold" },
  redeemBtn: { borderWidth:1, borderRadius:6, paddingHorizontal:8, paddingVertical:3, marginTop:4 },
  redeemTxt: { fontSize:10, fontFamily:"Inter_600SemiBold" },
  txRow: { flexDirection:"row", alignItems:"flex-start", paddingVertical:12, gap:10 },
  txIcon: { width:38, height:38, borderRadius:19, alignItems:"center", justifyContent:"center" },
  txInfo: { flex:1 },
  txType: { fontSize:13, fontFamily:"Inter_600SemiBold" },
  txTime: { fontSize:10, fontFamily:"Inter_400Regular", marginTop:2 },
  txHash: { fontSize:9.5, fontFamily:"Inter_400Regular", marginTop:2 },
  txAmount: { fontSize:13, fontFamily:"Inter_700Bold" },
  txStatus: { flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:6, paddingVertical:2, borderRadius:5, marginTop:3 },
  txDot: { width:5, height:5, borderRadius:2.5 },
  txStatusTxt: { fontSize:9.5, fontFamily:"Inter_600SemiBold" },
  modalOverlay: { flex:1, justifyContent:"flex-end", backgroundColor:"#00000088" },
  modalSheet: { borderTopLeftRadius:20, borderTopRightRadius:20, borderWidth:1, padding:16, paddingBottom:36 },
  handle: { width:40, height:4, borderRadius:2, alignSelf:"center", marginBottom:14 },
  modalTitle: { fontSize:16, fontFamily:"Inter_700Bold", marginBottom:14 },
  assetOpt: { flexDirection:"row", justifyContent:"space-between", alignItems:"center", paddingVertical:14 },
  assetOptTxt: { fontSize:14, fontFamily:"Inter_600SemiBold" },
  inputWrap: { flexDirection:"row", alignItems:"center", borderRadius:10, borderWidth:1, paddingHorizontal:12, paddingVertical:12, marginBottom:10 },
  inputLabel: { fontSize:11, fontFamily:"Inter_500Medium", marginRight:8 },
  inputField: { flex:1, fontSize:13, fontFamily:"Inter_600SemiBold", padding:0 },
  submitBtn: { borderRadius:12, paddingVertical:14, alignItems:"center", marginBottom:8 },
  submitTxt: { fontSize:14, fontFamily:"Inter_700Bold" },
  cancelModal: { borderRadius:12, paddingVertical:14, alignItems:"center" },
  cancelModalTxt: { fontSize:14, fontFamily:"Inter_600SemiBold" },
});
