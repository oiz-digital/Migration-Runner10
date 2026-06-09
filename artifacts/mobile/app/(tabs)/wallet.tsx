import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
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
import { EmptyState } from "@/components/EmptyState";
import { PriceChange } from "@/components/PriceChange";

interface WalletItem {
  symbol: string;
  balance: string;
  locked: string;
  priceInr?: number;
  priceUsdt?: number;
  name?: string;
}
interface WalletResponse { wallets: WalletItem[] }

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", USDT: "#26a17b", INR: "#ff9933",
  MATIC: "#8247e5", AVAX: "#e84142", DOT: "#e6007a", LINK: "#2a5ada",
  DEFAULT: "#6b7a9e",
};

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { priceMap, inrRate } = usePrices();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => apiFetch<WalletResponse>("/api/finance/wallet"),
    enabled: isAuthenticated,
  });

  const wallets = (data?.wallets ?? []).filter((w) => parseFloat(w.balance) > 0 || parseFloat(w.locked) > 0);

  const totalInr = wallets.reduce((sum, w) => {
    const bal = parseFloat(w.balance) || 0;
    const tick = priceMap[w.symbol.toUpperCase()];
    if (w.symbol.toUpperCase() === "INR") return sum + bal;
    const px = tick?.inr ?? (tick?.usdt ?? 0) * inrRate;
    return sum + bal * px;
  }, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={wallets}
        keyExtractor={(w) => w.symbol}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View>
            <View style={[styles.header, { paddingTop: topPt }]}>
              <Text style={[styles.title, { color: colors.foreground }]}>Wallet</Text>
              <TouchableOpacity
                style={[styles.histBtn, { backgroundColor: colors.muted }]}
                onPress={() => router.push("/orders")}
              >
                <Feather name="clock" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* Balance card */}
            <View style={styles.cardWrap}>
              <LinearGradient
                colors={["#1a1200", "#0d1524"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.balCard, { borderColor: colors.border }]}
              >
                <Text style={styles.balLabel}>Total Balance</Text>
                <Text style={styles.balValue}>
                  {isAuthenticated
                    ? `₹${totalInr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                    : "Login to view"}
                </Text>
                {!isAuthenticated && (
                  <TouchableOpacity
                    style={styles.loginBtn}
                    onPress={() => router.push("/login")}
                  >
                    <Text style={styles.loginLabel}>Login / Sign Up</Text>
                  </TouchableOpacity>
                )}
              </LinearGradient>
            </View>

            <Text style={[styles.subTitle, { color: colors.foreground }]}>Your Assets</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: botPt + 80, flexGrow: 1 }}
        renderItem={({ item: w }) => {
          const bal = parseFloat(w.balance) || 0;
          const tick = priceMap[w.symbol.toUpperCase()];
          const pxInr = w.symbol.toUpperCase() === "INR"
            ? 1
            : tick?.inr ?? (tick?.usdt ?? 0) * inrRate;
          const valueInr = bal * pxInr;
          const bg = COIN_COLORS[w.symbol.toUpperCase()] ?? COIN_COLORS.DEFAULT;
          return (
            <TouchableOpacity
              style={[styles.assetRow, { borderBottomColor: colors.border }]}
              onPress={() => router.push(`/wallet/${w.symbol}` as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.coinIcon, { backgroundColor: bg + "22" }]}>
                <Text style={[styles.coinLetter, { color: bg }]}>{w.symbol.charAt(0)}</Text>
              </View>
              <View style={styles.assetInfo}>
                <Text style={[styles.assetSym, { color: colors.foreground }]}>{w.symbol}</Text>
                {w.name ? <Text style={[styles.assetName, { color: colors.mutedForeground }]}>{w.name}</Text> : null}
              </View>
              <View style={styles.assetRight}>
                <Text style={[styles.assetBal, { color: colors.foreground }]}>
                  {bal < 0.00001 ? bal.toExponential(2) : bal.toFixed(bal < 0.01 ? 6 : 4)} {w.symbol}
                </Text>
                <Text style={[styles.assetVal, { color: colors.mutedForeground }]}>
                  ≈ ₹{valueInr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          isAuthenticated
            ? <EmptyState icon="credit-card" title="No assets yet" subtitle="Deposit to get started" />
            : <EmptyState icon="lock" title="Login required" subtitle="Sign in to view your wallet" />
        }
      />
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
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: "800" },
  histBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  cardWrap: { paddingHorizontal: 16, marginBottom: 16 },
  balCard: { borderRadius: 16, padding: 20, borderWidth: 1 },
  balLabel: { color: "#6b7a9e", fontSize: 13 },
  balValue: { color: "#f8fafc", fontSize: 28, fontWeight: "800", marginTop: 4, marginBottom: 8 },
  loginBtn: {
    backgroundColor: "#eb9100",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  loginLabel: { color: "#fff", fontWeight: "700" },
  subTitle: { fontSize: 17, fontWeight: "700", paddingHorizontal: 16, marginBottom: 4 },
  assetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  coinIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 12 },
  coinLetter: { fontSize: 18, fontWeight: "700" },
  assetInfo: { flex: 1 },
  assetSym: { fontSize: 15, fontWeight: "600" },
  assetName: { fontSize: 12, marginTop: 2 },
  assetRight: { alignItems: "flex-end", gap: 2 },
  assetBal: { fontSize: 14, fontWeight: "600" },
  assetVal: { fontSize: 12 },
});
