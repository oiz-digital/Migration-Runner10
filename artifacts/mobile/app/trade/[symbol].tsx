import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePrices } from "@/hooks/usePrices";
import { apiFetch, apiPost } from "@/hooks/useApi";
import { AnimatedPrice } from "@/components/AnimatedPrice";
import { CandleChart } from "@/components/CandleChart";
import { PriceChange } from "@/components/PriceChange";

interface OrderBookEntry { price: number; qty: number; total?: number }
interface OrderBook { bids: OrderBookEntry[]; asks: OrderBookEntry[] }
interface OpenOrder { id: number; side: string; type: string; amount: number; price?: number; filled: number; status: string }
interface Trade { id: number; price: number; qty: number; side: string; time: string }

type OrderType = "limit" | "market";
type Side = "buy" | "sell";
type TabKey = "orderbook" | "trades" | "myorders";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", SOL: "#9945ff",
  XRP: "#346aa9", DEFAULT: "#6b7a9e",
};

export default function TradeSymbolScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { priceMap } = usePrices();

  const base = symbol?.replace(/USDT$|INR$/, "") ?? "BTC";
  const quote = symbol?.includes("INR") ? "INR" : "USDT";
  const tick = priceMap[base.toUpperCase()];
  const price = quote === "INR" ? (tick?.inr ?? 0) : (tick?.usdt ?? 0);
  const change24h = tick?.change24h ?? 0;
  const high24h = price * (1 + Math.abs(change24h) / 100 + 0.005);
  const low24h = price * (1 - Math.abs(change24h) / 100 - 0.003);
  const coinBg = COIN_COLORS[base.toUpperCase()] ?? COIN_COLORS.DEFAULT;

  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("orderbook");

  useEffect(() => {
    if (price > 0 && !limitPrice) setLimitPrice(price.toFixed(price < 1 ? 4 : 2));
  }, [price]);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: bookData } = useQuery({
    queryKey: ["orderbook", base, quote],
    queryFn: () => apiFetch<OrderBook>(`/api/exchange/orderbook/${base}/${quote}`),
    refetchInterval: 2000,
  });

  const { data: recentTrades } = useQuery({
    queryKey: ["trades", base, quote],
    queryFn: () => apiFetch<Trade[]>(`/api/exchange/trades/${base}/${quote}`),
    refetchInterval: 3000,
    enabled: activeTab === "trades",
  });

  const { data: openOrders, refetch: refetchOrders } = useQuery({
    queryKey: ["openorders", base, quote],
    queryFn: () => apiFetch<OpenOrder[]>(`/api/exchange/order?status=open`),
    enabled: isAuthenticated && activeTab === "myorders",
  });

  const placeMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/exchange/order", body),
    onSuccess: () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAmount("");
      setPct(null);
      void refetchOrders();
      void qc.invalidateQueries({ queryKey: ["wallet"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/exchange/order/${id}`, { method: "DELETE" }),
    onSuccess: () => void refetchOrders(),
  });

  const handlePlace = () => {
    if (!isAuthenticated) { router.push("/login"); return; }
    const qty = parseFloat(amount);
    if (!qty || qty <= 0) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const body: Record<string, unknown> = { pair: `${base}/${quote}`, side, type: orderType, amount: qty };
    if (orderType === "limit") body.price = parseFloat(limitPrice);
    placeMutation.mutate(body);
  };

  const asks = (bookData?.asks ?? []).slice(0, 10);
  const bids = (bookData?.bids ?? []).slice(0, 10);
  const maxAskTotal = Math.max(...asks.map((e) => e.total ?? e.price * e.qty), 1);
  const maxBidTotal = Math.max(...bids.map((e) => e.total ?? e.price * e.qty), 1);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.coinDot, { backgroundColor: coinBg + "30" }]}>
            <Text style={[styles.coinDotText, { color: coinBg }]}>{base.charAt(0)}</Text>
          </View>
          <View>
            <Text style={[styles.headerSymbol, { color: colors.foreground }]}>{base}/{quote}</Text>
            <PriceChange value={change24h} fontSize={11} />
          </View>
        </View>
        <View style={styles.headerStats}>
          <AnimatedPrice
            price={price}
            format={(p) => `${quote === "INR" ? "₹" : "$"}${p.toLocaleString("en-US", { maximumFractionDigits: p < 1 ? 6 : 2 })}`}
            style={{ color: change24h >= 0 ? colors.success : colors.destructive, fontSize: 18, fontWeight: "900" }}
          />
        </View>
        <TouchableOpacity onPress={() => router.push("/orders")} style={styles.backBtn}>
          <Feather name="list" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* 24h stats */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: "24h High", value: `${quote === "INR" ? "₹" : "$"}${high24h.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, color: colors.success },
          { label: "24h Low", value: `${quote === "INR" ? "₹" : "$"}${low24h.toLocaleString("en-US", { maximumFractionDigits: 2 })}`, color: colors.destructive },
          { label: "24h Vol", value: tick?.volume24h ? `${(tick.volume24h / 1e6).toFixed(1)}M` : "—", color: colors.foreground },
        ].map((s) => (
          <View key={s.label} style={styles.statItem}>
            <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: botPt + 20 }}>
        {/* Candlestick chart */}
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <CandleChart symbol={base} height={200} />
        </View>

        {/* Order book + order form side by side */}
        <View style={styles.tradeSection}>
          {/* Left: Order book */}
          <View style={styles.bookPanel}>
            {/* Tabs */}
            <View style={[styles.bookTabs, { borderBottomColor: colors.border }]}>
              {(["orderbook", "trades", "myorders"] as TabKey[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.bookTab, t === activeTab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                  onPress={() => setActiveTab(t)}
                >
                  <Text style={[styles.bookTabLabel, { color: t === activeTab ? colors.primary : colors.mutedForeground }]}>
                    {t === "orderbook" ? "Book" : t === "trades" ? "Trades" : "Mine"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {activeTab === "orderbook" && (
              <View>
                <View style={styles.bookColHeader}>
                  <Text style={[styles.bookColLabel, { color: colors.mutedForeground }]}>Price</Text>
                  <Text style={[styles.bookColLabel, { color: colors.mutedForeground, textAlign: "right" }]}>Amount</Text>
                </View>
                {[...asks].reverse().map((a, i) => (
                  <TouchableOpacity key={i} style={styles.bookRow} onPress={() => setLimitPrice(a.price.toFixed(a.price < 1 ? 4 : 2))}>
                    <View style={[styles.depthBg, { width: `${Math.min(100, ((a.total ?? a.price * a.qty) / maxAskTotal) * 100)}%`, backgroundColor: "#e8151512" }]} />
                    <Text style={[styles.bookPrice, { color: colors.destructive }]}>{a.price.toFixed(a.price < 1 ? 4 : 2)}</Text>
                    <Text style={[styles.bookQty, { color: colors.foreground }]}>{a.qty.toFixed(3)}</Text>
                  </TouchableOpacity>
                ))}
                <View style={[styles.midRow, { borderColor: colors.border }]}>
                  <AnimatedPrice
                    price={price}
                    format={(p) => p.toFixed(p < 1 ? 6 : 2)}
                    style={{ color: change24h >= 0 ? colors.success : colors.destructive, fontSize: 14, fontWeight: "800" }}
                  />
                </View>
                {bids.map((b, i) => (
                  <TouchableOpacity key={i} style={styles.bookRow} onPress={() => setLimitPrice(b.price.toFixed(b.price < 1 ? 4 : 2))}>
                    <View style={[styles.depthBg, { width: `${Math.min(100, ((b.total ?? b.price * b.qty) / maxBidTotal) * 100)}%`, backgroundColor: "#22c55e12" }]} />
                    <Text style={[styles.bookPrice, { color: colors.success }]}>{b.price.toFixed(b.price < 1 ? 4 : 2)}</Text>
                    <Text style={[styles.bookQty, { color: colors.foreground }]}>{b.qty.toFixed(3)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {activeTab === "trades" && (
              <View>
                <View style={styles.bookColHeader}>
                  <Text style={[styles.bookColLabel, { color: colors.mutedForeground }]}>Price</Text>
                  <Text style={[styles.bookColLabel, { color: colors.mutedForeground, textAlign: "right" }]}>Qty</Text>
                </View>
                {(recentTrades ?? []).slice(0, 20).map((t, i) => (
                  <View key={i} style={styles.bookRow}>
                    <Text style={[styles.bookPrice, { color: t.side === "buy" ? colors.success : colors.destructive }]}>
                      {t.price.toFixed(2)}
                    </Text>
                    <Text style={[styles.bookQty, { color: colors.foreground }]}>{t.qty.toFixed(3)}</Text>
                  </View>
                ))}
              </View>
            )}

            {activeTab === "myorders" && (
              <View>
                {!isAuthenticated ? (
                  <TouchableOpacity style={styles.loginPrompt} onPress={() => router.push("/login")}>
                    <Text style={[styles.loginPromptText, { color: colors.primary }]}>Login to see orders</Text>
                  </TouchableOpacity>
                ) : (openOrders ?? []).length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No open orders</Text>
                ) : (
                  (openOrders ?? []).map((o) => (
                    <View key={o.id} style={[styles.myOrderRow, { borderBottomColor: colors.border }]}>
                      <View>
                        <Text style={[styles.myOrderSide, { color: o.side === "buy" ? colors.success : colors.destructive }]}>
                          {o.side.toUpperCase()}
                        </Text>
                        <Text style={[styles.myOrderDetail, { color: colors.mutedForeground }]}>
                          {o.amount.toFixed(3)} @ {o.price?.toFixed(2) ?? "mkt"}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => cancelMutation.mutate(o.id)}>
                        <Text style={[styles.cancelText, { color: colors.destructive }]}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>

          {/* Right: Order form */}
          <View style={styles.formPanel}>
            {/* Side toggle */}
            <View style={[styles.sideToggle, { backgroundColor: colors.muted }]}>
              <TouchableOpacity
                style={[styles.sideBtn, side === "buy" && { backgroundColor: "#22c55e" }]}
                onPress={() => setSide("buy")}
              >
                <Text style={[styles.sideBtnLabel, { color: side === "buy" ? "#fff" : colors.mutedForeground }]}>Buy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sideBtn, side === "sell" && { backgroundColor: "#e81515" }]}
                onPress={() => setSide("sell")}
              >
                <Text style={[styles.sideBtnLabel, { color: side === "sell" ? "#fff" : colors.mutedForeground }]}>Sell</Text>
              </TouchableOpacity>
            </View>

            {/* Order type */}
            <View style={styles.typeRow}>
              {(["limit", "market"] as OrderType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeBtn, { borderColor: orderType === t ? colors.primary : colors.border }]}
                  onPress={() => setOrderType(t)}
                >
                  <Text style={[styles.typeBtnLabel, { color: orderType === t ? colors.primary : colors.mutedForeground }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Price input */}
            {orderType === "limit" && (
              <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.inputLbl, { color: colors.mutedForeground }]}>Px</Text>
                <TextInput
                  style={[styles.orderInput, { color: colors.foreground }]}
                  value={limitPrice}
                  onChangeText={setLimitPrice}
                  keyboardType="decimal-pad"
                  placeholder={price.toFixed(2)}
                  placeholderTextColor={colors.mutedForeground}
                />
                <Text style={[styles.inputUnit, { color: colors.mutedForeground }]}>{quote}</Text>
              </View>
            )}

            {/* Amount */}
            <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.inputLbl, { color: colors.mutedForeground }]}>Qty</Text>
              <TextInput
                style={[styles.orderInput, { color: colors.foreground }]}
                value={amount}
                onChangeText={(v) => { setAmount(v); setPct(null); }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
              />
              <Text style={[styles.inputUnit, { color: colors.mutedForeground }]}>{base}</Text>
            </View>

            {/* Quick % */}
            <View style={styles.pctRow}>
              {[25, 50, 75, 100].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.pctBtn, { borderColor: colors.border }, pct === p && { borderColor: colors.primary, backgroundColor: colors.primary + "20" }]}
                  onPress={() => { setPct(p); setAmount(""); }}
                >
                  <Text style={[styles.pctLabel, { color: pct === p ? colors.primary : colors.mutedForeground }]}>{p}%</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Total estimate */}
            {amount && price > 0 && (
              <Text style={[styles.totalEst, { color: colors.mutedForeground }]}>
                ≈ {quote === "INR" ? "₹" : "$"}{(parseFloat(amount) * (orderType === "limit" ? parseFloat(limitPrice) || price : price)).toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </Text>
            )}

            {/* Place button */}
            <TouchableOpacity
              style={[styles.placeBtn, { backgroundColor: side === "buy" ? "#22c55e" : "#e81515" }, placeMutation.isPending && { opacity: 0.6 }]}
              onPress={handlePlace}
              disabled={placeMutation.isPending}
              activeOpacity={0.85}
            >
              <Text style={styles.placeBtnLabel}>
                {placeMutation.isPending ? "…" : `${side === "buy" ? "Buy" : "Sell"} ${base}`}
              </Text>
            </TouchableOpacity>

            {placeMutation.isSuccess && (
              <View style={[styles.feedbackMsg, { backgroundColor: "#22c55e20" }]}>
                <Feather name="check-circle" size={12} color="#22c55e" />
                <Text style={[styles.feedbackText, { color: "#22c55e" }]}>Order placed!</Text>
              </View>
            )}
            {placeMutation.isError && (
              <View style={[styles.feedbackMsg, { backgroundColor: "#e8151520" }]}>
                <Feather name="alert-circle" size={12} color="#e81515" />
                <Text style={[styles.feedbackText, { color: "#e81515" }]} numberOfLines={2}>
                  {(placeMutation.error as Error).message}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  coinDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  coinDotText: { fontSize: 14, fontWeight: "800" },
  headerSymbol: { fontSize: 15, fontWeight: "700" },
  headerStats: {},
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  statItem: { flex: 1 },
  statVal: { fontSize: 12, fontWeight: "700" },
  statLbl: { fontSize: 10, marginTop: 1 },
  chartCard: {
    marginHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  tradeSection: { flexDirection: "row", gap: 0 },
  bookPanel: { flex: 1, borderRightWidth: StyleSheet.hairlineWidth },
  bookTabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  bookTab: { flex: 1, paddingVertical: 8, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  bookTabLabel: { fontSize: 11, fontWeight: "700" },
  bookColHeader: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 4 },
  bookColLabel: { fontSize: 9, fontWeight: "600", textTransform: "uppercase" },
  bookRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 2.5, position: "relative" },
  depthBg: { position: "absolute", right: 0, top: 0, bottom: 0 },
  bookPrice: { fontSize: 11, fontWeight: "600", zIndex: 1 },
  bookQty: { fontSize: 11, zIndex: 1 },
  midRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginVertical: 2 },
  myOrderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  myOrderSide: { fontSize: 11, fontWeight: "700" },
  myOrderDetail: { fontSize: 10, marginTop: 1 },
  cancelText: { fontSize: 14, fontWeight: "700", padding: 4 },
  loginPrompt: { padding: 12, alignItems: "center" },
  loginPromptText: { fontSize: 12, fontWeight: "600" },
  emptyText: { padding: 16, fontSize: 12, textAlign: "center" },
  formPanel: { width: 150, padding: 8, gap: 6 },
  sideToggle: { flexDirection: "row", borderRadius: 7, padding: 2, gap: 2 },
  sideBtn: { flex: 1, paddingVertical: 7, borderRadius: 5, alignItems: "center" },
  sideBtnLabel: { fontSize: 12, fontWeight: "800" },
  typeRow: { flexDirection: "row", gap: 4 },
  typeBtn: { flex: 1, paddingVertical: 5, borderRadius: 5, borderWidth: 1, alignItems: "center" },
  typeBtnLabel: { fontSize: 10, fontWeight: "700" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 6,
    height: 36,
    gap: 4,
  },
  inputLbl: { fontSize: 9, fontWeight: "700", width: 18 },
  orderInput: { flex: 1, fontSize: 12 },
  inputUnit: { fontSize: 9, fontWeight: "700", width: 28, textAlign: "right" },
  pctRow: { flexDirection: "row", gap: 3 },
  pctBtn: { flex: 1, paddingVertical: 3, borderRadius: 4, borderWidth: 1, alignItems: "center" },
  pctLabel: { fontSize: 9, fontWeight: "700" },
  totalEst: { fontSize: 10, textAlign: "center" },
  placeBtn: { height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  placeBtnLabel: { color: "#fff", fontSize: 12, fontWeight: "900" },
  feedbackMsg: { flexDirection: "row", alignItems: "center", padding: 6, borderRadius: 5, gap: 4 },
  feedbackText: { fontSize: 10, fontWeight: "600", flex: 1 },
});
