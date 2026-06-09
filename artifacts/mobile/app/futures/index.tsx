import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePrices } from "@/hooks/usePrices";
import { apiPost } from "@/hooks/useApi";
import { AnimatedPrice } from "@/components/AnimatedPrice";
import { PriceChange } from "@/components/PriceChange";
import { SparkLine } from "@/components/SparkLine";

const FUTURES_COINS = ["BTC", "ETH", "SOL", "BNB", "XRP", "MATIC", "AVAX", "ADA", "DOT", "LINK", "DOGE", "NEAR"];
const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", MATIC: "#8247e5", AVAX: "#e84142",
  DOT: "#e6007a", LINK: "#2a5ada", DOGE: "#c2a633", NEAR: "#00c08b",
  DEFAULT: "#6b7a9e",
};
const LEVERAGES = [5, 10, 20, 25, 50, 100];

function genSparkData(price: number, change24h: number, symbol: string, n = 20): number[] {
  let seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const start = price / (1 + change24h / 100);
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const trend = start * (change24h / 100) * t;
    const noise = (rng() - 0.5) * start * 0.012;
    pts.push(Math.max(start + trend + noise, 1e-8));
  }
  pts[n - 1] = price;
  return pts;
}

export default function FuturesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { ticks, priceMap } = usePrices();

  const [selected, setSelected] = useState<string>("BTC");
  const [side, setSide] = useState<"long" | "short">("long");
  const [leverage, setLeverage] = useState(10);
  const [margin, setMargin] = useState("");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const pairs = useMemo(() =>
    FUTURES_COINS.map((sym) => ticks.find((t) => t.symbol === sym)).filter(Boolean) as typeof ticks,
    [ticks]
  );

  const tick = priceMap[selected];
  const price = tick?.usdt ?? 0;
  const change24h = tick?.change24h ?? 0;
  const positionSize = margin ? parseFloat(margin) * leverage : 0;
  const liquidation = price > 0
    ? side === "long"
      ? price * (1 - 1 / leverage * 0.9)
      : price * (1 + 1 / leverage * 0.9)
    : 0;

  const orderMutation = useMutation({
    mutationFn: (body: object) => apiPost("/api/futures/order", body),
    onSuccess: () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMargin("");
      void qc.invalidateQueries({ queryKey: ["futures-positions"] });
    },
  });

  const selBg = COIN_COLORS[selected] ?? COIN_COLORS.DEFAULT;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Futures</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push("/orders")}>
          <Feather name="list" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {/* Left: Pair list */}
        <View style={[styles.pairList, { borderRightColor: colors.border }]}>
          <View style={[styles.pairListHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pairListTitle, { color: colors.mutedForeground }]}>Perp</Text>
          </View>
          <FlatList
            data={pairs}
            keyExtractor={(t) => t.symbol}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: t }) => {
              const bg = COIN_COLORS[t.symbol] ?? COIN_COLORS.DEFAULT;
              const sel = t.symbol === selected;
              const spark = genSparkData(t.usdt, t.change24h, t.symbol);
              return (
                <TouchableOpacity
                  style={[styles.pairRow, { borderBottomColor: colors.border }, sel && { backgroundColor: colors.primary + "14" }]}
                  onPress={() => setSelected(t.symbol)}
                >
                  <View style={[styles.pairDot, { backgroundColor: bg }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pairSym, { color: sel ? colors.primary : colors.foreground }]}>{t.symbol}</Text>
                    <PriceChange value={t.change24h} fontSize={10} />
                  </View>
                  <SparkLine data={spark} width={36} height={20} positive={t.change24h >= 0} id={`f${t.symbol}`} />
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Right: Order form */}
        <ScrollView style={styles.formArea} contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: botPt + 20 }}>
          {/* Selected pair header */}
          <View style={styles.pairHeader}>
            <View style={[styles.pairIcon, { backgroundColor: selBg + "22" }]}>
              <Text style={[styles.pairIconText, { color: selBg }]}>{selected.charAt(0)}</Text>
            </View>
            <View>
              <Text style={[styles.pairFullName, { color: colors.foreground }]}>{selected}-PERP</Text>
              <AnimatedPrice
                price={price}
                format={(p) => `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                style={{ color: change24h >= 0 ? colors.success : colors.destructive, fontSize: 14, fontWeight: "800" }}
              />
            </View>
            <View style={[styles.changePill, { backgroundColor: change24h >= 0 ? "#22c55e20" : "#e8151520" }]}>
              <Text style={[styles.changeText, { color: change24h >= 0 ? colors.success : colors.destructive }]}>
                {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
              </Text>
            </View>
          </View>

          {/* Side */}
          <View style={[styles.sideToggle, { backgroundColor: colors.muted }]}>
            <TouchableOpacity
              style={[styles.sideBtn, side === "long" && { backgroundColor: "#22c55e" }]}
              onPress={() => setSide("long")}
            >
              <Feather name="trending-up" size={12} color={side === "long" ? "#fff" : colors.mutedForeground} />
              <Text style={[styles.sideBtnLabel, { color: side === "long" ? "#fff" : colors.mutedForeground }]}>Long</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sideBtn, side === "short" && { backgroundColor: "#e81515" }]}
              onPress={() => setSide("short")}
            >
              <Feather name="trending-down" size={12} color={side === "short" ? "#fff" : colors.mutedForeground} />
              <Text style={[styles.sideBtnLabel, { color: side === "short" ? "#fff" : colors.mutedForeground }]}>Short</Text>
            </TouchableOpacity>
          </View>

          {/* Leverage */}
          <View>
            <View style={styles.levHeader}>
              <Text style={[styles.levTitle, { color: colors.foreground }]}>Leverage</Text>
              <View style={[styles.levBadge, { backgroundColor: colors.primary + "20" }]}>
                <Text style={[styles.levBadgeText, { color: colors.primary }]}>{leverage}x</Text>
              </View>
            </View>
            <View style={styles.levRow}>
              {LEVERAGES.map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[styles.levBtn, { borderColor: l === leverage ? colors.primary : colors.border }, l === leverage && { backgroundColor: colors.primary + "20" }]}
                  onPress={() => setLeverage(l)}
                >
                  <Text style={[styles.levBtnLabel, { color: l === leverage ? colors.primary : colors.mutedForeground }]}>{l}x</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Margin */}
          <View>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Margin (USDT)</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <TextInput
                style={[styles.inputField, { color: colors.foreground }]}
                value={margin}
                onChangeText={setMargin}
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.inputUnit, { color: colors.mutedForeground }]}>USDT</Text>
            </View>
          </View>

          {/* Position details */}
          {positionSize > 0 && (
            <View style={[styles.detailsBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Position Size</Text>
                <Text style={[styles.detailVal, { color: colors.foreground }]}>${positionSize.toFixed(2)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Liquidation Price</Text>
                <Text style={[styles.detailVal, { color: colors.destructive }]}>${liquidation.toFixed(2)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Required Margin</Text>
                <Text style={[styles.detailVal, { color: colors.foreground }]}>${margin}</Text>
              </View>
            </View>
          )}

          {orderMutation.isSuccess && (
            <View style={[styles.successMsg, { backgroundColor: "#22c55e20" }]}>
              <Feather name="check-circle" size={14} color="#22c55e" />
              <Text style={{ color: "#22c55e", fontSize: 13, fontWeight: "600" }}>Order placed!</Text>
            </View>
          )}
          {orderMutation.isError && (
            <View style={[styles.successMsg, { backgroundColor: "#e8151520" }]}>
              <Feather name="alert-circle" size={14} color="#e81515" />
              <Text style={{ color: "#e81515", fontSize: 12, flex: 1 }} numberOfLines={2}>
                {(orderMutation.error as Error).message}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.orderBtn, { backgroundColor: side === "long" ? "#22c55e" : "#e81515" }, orderMutation.isPending && { opacity: 0.6 }]}
            onPress={() => {
              if (!isAuthenticated) { router.push("/login"); return; }
              if (!margin || parseFloat(margin) <= 0) return;
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              orderMutation.mutate({
                symbol: selected,
                side: side === "long" ? "buy" : "sell",
                leverage,
                amount: parseFloat(margin),
                type: "market",
              });
            }}
            disabled={orderMutation.isPending}
          >
            <Feather name={side === "long" ? "trending-up" : "trending-down"} size={16} color="#fff" />
            <Text style={styles.orderBtnLabel}>
              {orderMutation.isPending ? "Placing..." : `Open ${side === "long" ? "Long" : "Short"} ${leverage}x`}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.riskNote, { color: colors.mutedForeground }]}>
            ⚠️ Futures trading involves high risk. You may lose more than your margin.
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  body: { flex: 1, flexDirection: "row" },
  pairList: { width: 100, borderRightWidth: StyleSheet.hairlineWidth },
  pairListHeader: { paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  pairListTitle: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  pairRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 5 },
  pairDot: { width: 5, height: 5, borderRadius: 2.5, flexShrink: 0 },
  pairSym: { fontSize: 11, fontWeight: "700" },
  formArea: { flex: 1 },
  pairHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  pairIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pairIconText: { fontSize: 15, fontWeight: "700" },
  pairFullName: { fontSize: 14, fontWeight: "700" },
  changePill: { marginLeft: "auto", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  changeText: { fontSize: 12, fontWeight: "700" },
  sideToggle: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 3 },
  sideBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: 8, gap: 5 },
  sideBtnLabel: { fontSize: 13, fontWeight: "800" },
  levHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  levTitle: { fontSize: 13, fontWeight: "600" },
  levBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  levBadgeText: { fontSize: 13, fontWeight: "800" },
  levRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  levBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  levBtnLabel: { fontSize: 12, fontWeight: "700" },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, height: 48, gap: 8 },
  inputField: { flex: 1, fontSize: 18, fontWeight: "700" },
  inputUnit: { fontSize: 13 },
  detailsBox: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 8 },
  detailRow: { flexDirection: "row", justifyContent: "space-between" },
  detailLabel: { fontSize: 12 },
  detailVal: { fontSize: 12, fontWeight: "700" },
  successMsg: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, gap: 8 },
  orderBtn: { height: 52, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  orderBtnLabel: { color: "#fff", fontSize: 15, fontWeight: "900" },
  riskNote: { fontSize: 11, textAlign: "center", lineHeight: 16 },
});
