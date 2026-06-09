import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { usePrices } from "@/hooks/usePrices";
import { apiFetch } from "@/hooks/useApi";
import { CoinRowWithSpark } from "@/components/CoinRowWithSpark";
import { StatsBar } from "@/components/StatsBar";
import { AnimatedPrice } from "@/components/AnimatedPrice";

interface WalletItem { symbol: string; balance: string; locked: string }
interface WalletResponse { wallets: WalletItem[] }

function genSparkData(price: number, change24h: number, symbol: string, n = 24): number[] {
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

const QUICK_ACTIONS = [
  { label: "Spot", icon: "repeat" as const, route: "/trade", color: "#eb9100" },
  { label: "Futures", icon: "trending-up" as const, route: "/futures", color: "#9945ff" },
  { label: "Convert", icon: "arrow-right-circle" as const, route: "/convert", color: "#22c55e" },
  { label: "P2P", icon: "users" as const, route: "/p2p", color: "#346aa9" },
  { label: "Earn", icon: "percent" as const, route: "/earn", color: "#f59e0b" },
  { label: "Copy", icon: "copy" as const, route: "/copy-trading", color: "#e84142" },
  { label: "AI Trade", icon: "cpu" as const, route: "/ai-trading", color: "#627eea" },
  { label: "Portfolio", icon: "pie-chart" as const, route: "/portfolio", color: "#00c08b" },
];

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { ticks, priceMap, inrRate } = usePrices();

  const { data: walletData, isLoading, refetch } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => apiFetch<WalletResponse>("/api/finance/wallet"),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const totalInr = useMemo(() => {
    if (!walletData?.wallets) return 0;
    return walletData.wallets.reduce((sum, w) => {
      const bal = parseFloat(w.balance) || 0;
      const tick = priceMap[w.symbol.toUpperCase()];
      if (w.symbol.toUpperCase() === "INR") return sum + bal;
      const px = tick?.inr ?? (tick?.usdt ?? 0) * inrRate;
      return sum + bal * px;
    }, 0);
  }, [walletData, priceMap, inrRate]);

  const btcDom = useMemo(() => {
    const btc = priceMap["BTC"];
    if (!btc) return 0;
    const total = ticks.reduce((s, t) => s + (t.usdt ?? 0) * (t.volume24h ?? 0), 0);
    const btcVol = (btc.usdt ?? 0) * (btc.volume24h ?? 0);
    return total > 0 ? (btcVol / total) * 100 : 0;
  }, [ticks, priceMap]);

  const totalVol = useMemo(() =>
    ticks.reduce((s, t) => s + (t.usdt ?? 0) * (t.volume24h ?? 0), 0),
    [ticks]);

  const topGainers = useMemo(() =>
    [...ticks]
      .filter((t) => t.usdt > 0 && t.symbol !== "USDT" && t.symbol !== "INR")
      .sort((a, b) => b.change24h - a.change24h)
      .slice(0, 10),
    [ticks]);

  const btc = priceMap["BTC"];
  const eth = priceMap["ETH"];

  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);
  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPt, paddingBottom: botPt + 90 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {user ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${user.name.split(" ")[0]}` : "Good day, Trader"}
            </Text>
            <Text style={[styles.brand, { color: colors.foreground }]}>Zebvix</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.muted }]}
              onPress={() => router.push("/notifications" as any)}
            >
              <Feather name="bell" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.muted }]}
              onPress={() => router.push(isAuthenticated ? "/(tabs)/profile" : "/login")}
            >
              <Feather name="user" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Market ticker */}
        {(btc || eth) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tickerScroll} contentContainerStyle={styles.tickerContent}>
            {[btc && { sym: "BTC", tick: btc }, eth && { sym: "ETH", tick: eth }]
              .filter(Boolean)
              .map((item: any) => (
                <TouchableOpacity
                  key={item.sym}
                  style={[styles.tickerPill, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => router.push(`/trade/${item.sym}USDT` as any)}
                >
                  <Text style={[styles.tickerSym, { color: colors.mutedForeground }]}>{item.sym}</Text>
                  <AnimatedPrice
                    price={item.tick.usdt}
                    format={(p) => `$${p.toLocaleString("en-US", { maximumFractionDigits: p < 100 ? 2 : 0 })}`}
                    style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}
                  />
                  <Text style={[styles.tickerChange, { color: item.tick.change24h >= 0 ? colors.success : colors.destructive }]}>
                    {item.tick.change24h >= 0 ? "+" : ""}{item.tick.change24h.toFixed(2)}%
                  </Text>
                </TouchableOpacity>
              ))}
            {totalVol > 0 && (
              <View style={[styles.tickerPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.tickerSym, { color: colors.mutedForeground }]}>24h Vol</Text>
                <Text style={[styles.tickerVal, { color: colors.foreground }]}>
                  ${(totalVol / 1e9).toFixed(1)}B
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Portfolio card */}
        <View style={styles.cardWrap}>
          <LinearGradient
            colors={["#1f1100", "#0a0f1e"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.portfolioCard, { borderColor: "#2a1f00" }]}
          >
            <View style={styles.portTop}>
              <View>
                <Text style={styles.portLabel}>Total Portfolio Value</Text>
                <AnimatedPrice
                  price={isAuthenticated ? totalInr : 0}
                  format={(p) => isAuthenticated ? `₹${p.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—"}
                  style={styles.portValue}
                />
                {isAuthenticated && (
                  <Text style={styles.portSub}>≈ ${(totalInr / inrRate).toLocaleString("en-US", { maximumFractionDigits: 0 })}</Text>
                )}
              </View>
              <View style={styles.portActions}>
                <TouchableOpacity
                  style={styles.portBtn}
                  onPress={() => router.push(isAuthenticated ? "/(tabs)/wallet" : "/login")}
                >
                  <Feather name="plus" size={14} color="#fff" />
                  <Text style={styles.portBtnLabel}>Deposit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.portBtn, styles.portBtnOutline]}
                  onPress={() => router.push(isAuthenticated ? "/(tabs)/wallet" : "/login")}
                >
                  <Feather name="arrow-up" size={14} color="#eb9100" />
                  <Text style={[styles.portBtnLabel, { color: "#eb9100" }]}>Withdraw</Text>
                </TouchableOpacity>
              </View>
            </View>
            {!isAuthenticated && (
              <TouchableOpacity style={styles.loginRow} onPress={() => router.push("/login")}>
                <Feather name="lock" size={12} color="#6b7a9e" />
                <Text style={styles.loginHint}>Login to view your balance</Text>
                <Feather name="chevron-right" size={12} color="#6b7a9e" />
              </TouchableOpacity>
            )}
          </LinearGradient>
        </View>

        {/* Market stats */}
        {ticks.length > 0 && (
          <StatsBar stats={[
            { label: "BTC Dom", value: `${btcDom.toFixed(1)}%`, valueColor: "#f7931a" },
            { label: "Coins", value: `${ticks.filter(t => t.usdt > 0).length}` },
            { label: "Gainers", value: `${ticks.filter(t => t.change24h > 0).length}`, valueColor: colors.success },
            { label: "Losers", value: `${ticks.filter(t => t.change24h < 0).length}`, valueColor: colors.destructive },
          ]} />
        )}

        {/* Quick actions */}
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((a) => (
            <TouchableOpacity
              key={a.label}
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(a.route as any);
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.actionIcon, { backgroundColor: a.color + "20" }]}>
                <Feather name={a.icon} size={18} color={a.color} />
              </View>
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Top Gainers */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>🔥 Top Gainers</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/markets")}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>View All →</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {topGainers.map((t, i) => (
            <CoinRowWithSpark
              key={t.symbol}
              symbol={t.symbol}
              price={t.usdt}
              change24h={t.change24h}
              volume={t.volume24h * t.usdt}
              sparkData={genSparkData(t.usdt, t.change24h, t.symbol)}
              rank={i + 1}
              onPress={() => router.push(`/trade/${t.symbol}USDT` as any)}
            />
          ))}
          {topGainers.length === 0 && (
            <View style={styles.loadingRow}>
              <Text style={{ color: colors.mutedForeground }}>Connecting to live markets...</Text>
            </View>
          )}
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
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLeft: {},
  greeting: { fontSize: 12 },
  brand: { fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  headerRight: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tickerScroll: { marginBottom: 12 },
  tickerContent: { paddingHorizontal: 16, gap: 8 },
  tickerPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  tickerSym: { fontSize: 11, fontWeight: "600" },
  tickerVal: { fontSize: 13, fontWeight: "700" },
  tickerChange: { fontSize: 11, fontWeight: "700" },
  cardWrap: { paddingHorizontal: 16, marginBottom: 12 },
  portfolioCard: { borderRadius: 18, padding: 20, borderWidth: 1 },
  portTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  portLabel: { color: "#6b7a9e", fontSize: 12 },
  portValue: { color: "#f8fafc", fontSize: 26, fontWeight: "900", marginTop: 2 },
  portSub: { color: "#6b7a9e", fontSize: 12, marginTop: 2 },
  portActions: { gap: 8 },
  portBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eb9100",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    gap: 4,
  },
  portBtnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#eb9100",
  },
  portBtnLabel: { color: "#fff", fontWeight: "700", fontSize: 12 },
  loginRow: { flexDirection: "row", alignItems: "center", marginTop: 14, gap: 6 },
  loginHint: { color: "#6b7a9e", fontSize: 12, flex: 1 },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    marginBottom: 16,
    gap: 8,
  },
  actionBtn: {
    width: "22%",
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontSize: 11, fontWeight: "600" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  seeAll: { fontSize: 13, fontWeight: "600" },
  listCard: { marginHorizontal: 16, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  loadingRow: { padding: 24, alignItems: "center" },
});
