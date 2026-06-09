import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback } from "react";
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
import { usePrices, PriceTick } from "@/hooks/usePrices";
import { apiFetch } from "@/hooks/useApi";
import { CoinRow } from "@/components/CoinRow";
import { PriceChange } from "@/components/PriceChange";

interface WalletItem {
  symbol: string;
  balance: string;
  locked: string;
  priceInr?: number;
  priceUsdt?: number;
}
interface WalletResponse { wallets: WalletItem[] }

const QUICK_ACTIONS = [
  { label: "Spot", icon: "repeat" as const, route: "/trade" },
  { label: "Futures", icon: "trending-up" as const, route: "/futures" },
  { label: "P2P", icon: "users" as const, route: "/p2p" },
  { label: "Earn", icon: "percent" as const, route: "/earn" },
  { label: "AI Trade", icon: "cpu" as const, route: "/ai-trading" },
  { label: "Orders", icon: "list" as const, route: "/orders" },
];

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { ticks, priceMap, inrRate } = usePrices();

  const { data: walletData, isLoading: walletLoading, refetch } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => apiFetch<WalletResponse>("/api/finance/wallet"),
    enabled: isAuthenticated,
  });

  const totalInr = React.useMemo(() => {
    if (!walletData?.wallets) return 0;
    return walletData.wallets.reduce((sum, w) => {
      const bal = parseFloat(w.balance) || 0;
      const tick = priceMap[w.symbol.toUpperCase()];
      if (w.symbol.toUpperCase() === "INR") return sum + bal;
      const px = tick?.inr ?? (tick?.usdt ?? 0) * inrRate;
      return sum + bal * px;
    }, 0);
  }, [walletData, priceMap, inrRate]);

  const topGainers = [...ticks]
    .filter((t) => t.usdt > 0)
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 8);

  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPt, paddingBottom: botPt + 80 }}
        refreshControl={
          <RefreshControl
            refreshing={walletLoading}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {user ? `Hello, ${user.name.split(" ")[0]}` : "Welcome back"}
            </Text>
            <Text style={[styles.brand, { color: colors.foreground }]}>Zebvix</Text>
          </View>
          <TouchableOpacity
            style={[styles.notifBtn, { backgroundColor: colors.muted }]}
            onPress={() => router.push(isAuthenticated ? "/orders" : "/login")}
          >
            <Feather name="bell" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Portfolio card */}
        <View style={styles.cardWrap}>
          <LinearGradient
            colors={["#1a1200", "#0d1524"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.portfolioCard, { borderColor: colors.border }]}
          >
            <View style={styles.portfolioRow}>
              <View>
                <Text style={styles.portLabel}>Total Portfolio</Text>
                <Text style={styles.portValue}>
                  {isAuthenticated
                    ? `₹${totalInr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                    : "—"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.depositBtn}
                onPress={() => router.push(isAuthenticated ? "/wallet" : "/login")}
              >
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.depositLabel}>Deposit</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.portFooter}>
              <Text style={styles.portSub}>
                {isAuthenticated ? "Tap to view wallet" : "Login to view balance"}
              </Text>
            </View>
          </LinearGradient>
        </View>

        {/* Quick actions */}
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((a) => (
            <TouchableOpacity
              key={a.label}
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push(a.route as any)}
              activeOpacity={0.75}
            >
              <View style={[styles.actionIcon, { backgroundColor: colors.primary + "20" }]}>
                <Feather name={a.icon} size={20} color={colors.primary} />
              </View>
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Top gainers */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Top Gainers</Text>
          <TouchableOpacity onPress={() => router.push("/markets")}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>See All</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {topGainers.map((t) => (
            <CoinRow
              key={t.symbol}
              symbol={t.symbol}
              price={t.usdt}
              change24h={t.change24h}
              volume={t.volume24h}
              onPress={() => router.push(`/trade/${t.symbol}USDT` as any)}
            />
          ))}
          {topGainers.length === 0 && (
            <View style={styles.loadingRow}>
              <Text style={{ color: colors.mutedForeground }}>Loading market data...</Text>
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
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  greeting: { fontSize: 13 },
  brand: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cardWrap: { paddingHorizontal: 16, marginBottom: 16 },
  portfolioCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  portfolioRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  portLabel: { color: "#6b7a9e", fontSize: 13 },
  portValue: { color: "#f8fafc", fontSize: 28, fontWeight: "800", marginTop: 4 },
  depositBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eb9100",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  depositLabel: { color: "#fff", fontWeight: "700", fontSize: 13 },
  portFooter: { marginTop: 12 },
  portSub: { color: "#6b7a9e", fontSize: 12 },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    marginBottom: 16,
    gap: 8,
  },
  actionBtn: {
    width: "30%",
    flexGrow: 1,
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontSize: 12, fontWeight: "600" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  seeAll: { fontSize: 13, fontWeight: "600" },
  listCard: { marginHorizontal: 16, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  loadingRow: { padding: 24, alignItems: "center" },
});
