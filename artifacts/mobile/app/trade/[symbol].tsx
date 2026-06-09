import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePrices } from "@/hooks/usePrices";
import { apiFetch, apiPost } from "@/hooks/useApi";
import { PriceChange } from "@/components/PriceChange";
import { ZButton } from "@/components/ZButton";

interface OrderBookEntry { price: number; qty: number; total: number }
interface OrderBook { bids: OrderBookEntry[]; asks: OrderBookEntry[] }
interface OpenOrder {
  id: number;
  side: string;
  type: string;
  amount: number;
  price?: number;
  filled: number;
  status: string;
}

type OrderType = "limit" | "market";
type Side = "buy" | "sell";

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

  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState(price > 0 ? price.toFixed(2) : "");

  useEffect(() => {
    if (price > 0 && !limitPrice) setLimitPrice(price.toFixed(2));
  }, [price]);

  const { data: bookData } = useQuery({
    queryKey: ["orderbook", base, quote],
    queryFn: () => apiFetch<OrderBook>(`/api/exchange/orderbook/${base}/${quote}`),
    refetchInterval: 3000,
  });

  const { data: openOrders, refetch: refetchOrders } = useQuery({
    queryKey: ["openorders", base, quote],
    queryFn: () => apiFetch<OpenOrder[]>(`/api/exchange/order?pair=${base}/${quote}&status=open`),
    enabled: isAuthenticated,
  });

  const placeMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/api/exchange/order", body),
    onSuccess: () => {
      setAmount("");
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
    const body: Record<string, unknown> = {
      pair: `${base}/${quote}`,
      side,
      type: orderType,
      amount: qty,
    };
    if (orderType === "limit") body.price = parseFloat(limitPrice);
    placeMutation.mutate(body);
  };

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const asks = bookData?.asks?.slice(0, 8) ?? [];
  const bids = bookData?.bids?.slice(0, 8) ?? [];
  const maxTotal = Math.max(...[...asks, ...bids].map((e) => e.total ?? e.price * e.qty), 1);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerSymbol, { color: colors.foreground }]}>{base}/{quote}</Text>
          <View style={styles.headerPriceRow}>
            <Text style={[styles.headerPrice, { color: change24h >= 0 ? colors.success : colors.destructive }]}>
              {quote === "INR" ? "₹" : "$"}{price.toLocaleString("en-US", { maximumFractionDigits: price < 1 ? 6 : 2 })}
            </Text>
            <PriceChange value={change24h} />
          </View>
        </View>
        <TouchableOpacity onPress={() => router.push("/orders")} style={styles.backBtn}>
          <Feather name="list" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: botPt + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Order Book */}
        <View style={styles.bookSection}>
          <View style={styles.bookColumn}>
            <View style={styles.bookHeader}>
              <Text style={[styles.bookColLabel, { color: colors.mutedForeground }]}>Price ({quote})</Text>
              <Text style={[styles.bookColLabel, { color: colors.mutedForeground }]}>Amount ({base})</Text>
            </View>
            {/* Asks (sells) - shown in reverse (lowest at bottom) */}
            {[...asks].reverse().map((a, i) => (
              <View key={i} style={styles.bookRow}>
                <View style={[styles.depthBar, { width: `${Math.min(100, ((a.total ?? a.price * a.qty) / maxTotal) * 100)}%`, backgroundColor: "#e8151520" }]} />
                <Text style={[styles.bookPrice, { color: colors.destructive }]}>
                  {a.price.toFixed(a.price < 1 ? 4 : 2)}
                </Text>
                <Text style={[styles.bookQty, { color: colors.foreground }]}>{a.qty.toFixed(4)}</Text>
              </View>
            ))}

            {/* Mid price */}
            <View style={[styles.midPrice, { borderColor: colors.border }]}>
              <Text style={[styles.midPriceText, { color: change24h >= 0 ? colors.success : colors.destructive }]}>
                {price.toFixed(price < 1 ? 6 : 2)}
              </Text>
              <PriceChange value={change24h} />
            </View>

            {/* Bids (buys) */}
            {bids.map((b, i) => (
              <View key={i} style={styles.bookRow}>
                <View style={[styles.depthBar, { width: `${Math.min(100, ((b.total ?? b.price * b.qty) / maxTotal) * 100)}%`, backgroundColor: "#22c55e20" }]} />
                <Text style={[styles.bookPrice, { color: colors.success }]}>
                  {b.price.toFixed(b.price < 1 ? 4 : 2)}
                </Text>
                <Text style={[styles.bookQty, { color: colors.foreground }]}>{b.qty.toFixed(4)}</Text>
              </View>
            ))}
          </View>

          {/* Order form */}
          <View style={styles.orderForm}>
            {/* Side toggle */}
            <View style={[styles.sideToggle, { backgroundColor: colors.muted }]}>
              <TouchableOpacity
                style={[styles.sideBtn, side === "buy" && { backgroundColor: colors.success }]}
                onPress={() => setSide("buy")}
              >
                <Text style={[styles.sideBtnLabel, { color: side === "buy" ? "#fff" : colors.mutedForeground }]}>Buy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sideBtn, side === "sell" && { backgroundColor: colors.destructive }]}
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
                  style={[styles.typeBtn, { borderColor: colors.border }, orderType === t && { borderColor: colors.primary }]}
                  onPress={() => setOrderType(t)}
                >
                  <Text style={[styles.typeBtnLabel, { color: orderType === t ? colors.primary : colors.mutedForeground }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Inputs */}
            {orderType === "limit" && (
              <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Price</Text>
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

            <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Amount</Text>
              <TextInput
                style={[styles.orderInput, { color: colors.foreground }]}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
              />
              <Text style={[styles.inputUnit, { color: colors.mutedForeground }]}>{base}</Text>
            </View>

            {/* Quick pct buttons */}
            <View style={styles.pctRow}>
              {["25%", "50%", "75%", "100%"].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.pctBtn, { borderColor: colors.border }]}
                  onPress={() => {}}
                >
                  <Text style={[styles.pctLabel, { color: colors.mutedForeground }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Place button */}
            <TouchableOpacity
              style={[styles.placeBtn, { backgroundColor: side === "buy" ? colors.success : colors.destructive }]}
              onPress={handlePlace}
              disabled={placeMutation.isPending}
              activeOpacity={0.85}
            >
              <Text style={styles.placeBtnLabel}>
                {placeMutation.isPending ? "Placing..." : `${side === "buy" ? "Buy" : "Sell"} ${base}`}
              </Text>
            </TouchableOpacity>

            {placeMutation.isSuccess && (
              <View style={[styles.successMsg, { backgroundColor: colors.success + "20" }]}>
                <Feather name="check-circle" size={14} color={colors.success} />
                <Text style={[styles.successText, { color: colors.success }]}>Order placed!</Text>
              </View>
            )}
            {placeMutation.isError && (
              <View style={[styles.successMsg, { backgroundColor: colors.destructive + "20" }]}>
                <Feather name="alert-circle" size={14} color={colors.destructive} />
                <Text style={[styles.successText, { color: colors.destructive }]}>
                  {(placeMutation.error as Error).message}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Open orders */}
        {isAuthenticated && (openOrders?.length ?? 0) > 0 && (
          <View style={styles.openOrdersSection}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Open Orders</Text>
            {openOrders?.map((o) => (
              <View key={o.id} style={[styles.orderRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.orderInfo}>
                  <Text style={[styles.orderSide, { color: o.side === "buy" ? colors.success : colors.destructive }]}>
                    {o.side.toUpperCase()} {o.type.toUpperCase()}
                  </Text>
                  <Text style={[styles.orderDetail, { color: colors.mutedForeground }]}>
                    {o.amount.toFixed(4)} {base} {o.price ? `@ ${o.price}` : "(market)"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => cancelMutation.mutate(o.id)}
                  style={[styles.cancelBtn, { borderColor: colors.destructive + "60" }]}
                >
                  <Text style={[styles.cancelLabel, { color: colors.destructive }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerSymbol: { fontSize: 16, fontWeight: "700" },
  headerPriceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  headerPrice: { fontSize: 18, fontWeight: "800" },
  bookSection: { flexDirection: "row", margin: 12, gap: 8 },
  bookColumn: { flex: 1 },
  bookHeader: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 4 },
  bookColLabel: { fontSize: 11, fontWeight: "600" },
  bookRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, position: "relative" },
  depthBar: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 2 },
  bookPrice: { fontSize: 12, fontWeight: "600", zIndex: 1 },
  bookQty: { fontSize: 12, zIndex: 1 },
  midPrice: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginVertical: 4,
  },
  midPriceText: { fontSize: 15, fontWeight: "800" },
  orderForm: { flex: 1, gap: 8 },
  sideToggle: { flexDirection: "row", borderRadius: 8, overflow: "hidden", padding: 3, gap: 3 },
  sideBtn: { flex: 1, paddingVertical: 7, borderRadius: 6, alignItems: "center" },
  sideBtnLabel: { fontSize: 13, fontWeight: "700" },
  typeRow: { flexDirection: "row", gap: 6 },
  typeBtn: { flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1, alignItems: "center" },
  typeBtnLabel: { fontSize: 12, fontWeight: "600" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 40,
    gap: 6,
  },
  inputLabel: { fontSize: 11, fontWeight: "600", width: 40 },
  orderInput: { flex: 1, fontSize: 13 },
  inputUnit: { fontSize: 11, fontWeight: "600", width: 36, textAlign: "right" },
  pctRow: { flexDirection: "row", gap: 4 },
  pctBtn: { flex: 1, paddingVertical: 4, borderRadius: 4, borderWidth: 1, alignItems: "center" },
  pctLabel: { fontSize: 11, fontWeight: "600" },
  placeBtn: {
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  placeBtnLabel: { color: "#fff", fontSize: 14, fontWeight: "800" },
  successMsg: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 6,
    gap: 6,
  },
  successText: { fontSize: 12, fontWeight: "600", flex: 1 },
  openOrdersSection: { paddingHorizontal: 12, gap: 8, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  orderInfo: { flex: 1 },
  orderSide: { fontSize: 13, fontWeight: "700" },
  orderDetail: { fontSize: 12, marginTop: 2 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  cancelLabel: { fontSize: 12, fontWeight: "600" },
});
