import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";

interface EarnPool {
  id: number;
  name: string;
  coinSymbol: string;
  apy: string;
  minAmount: string;
  maxAmount: string;
  duration: number;
  totalStaked: string;
  status: string;
  flexible: boolean;
}

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", USDT: "#26a17b", BNB: "#f3ba2f",
  SOL: "#9945ff", DEFAULT: "#eb9100",
};

export default function EarnScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: pools, isLoading, error } = useQuery({
    queryKey: ["earn-pools"],
    queryFn: () => apiFetch<EarnPool[]>("/api/staking/pool"),
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Earn</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Banner */}
      <View style={[styles.banner, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
        <Feather name="percent" size={20} color={colors.primary} />
        <View>
          <Text style={[styles.bannerTitle, { color: colors.foreground }]}>Stake & Earn</Text>
          <Text style={[styles.bannerSub, { color: colors.mutedForeground }]}>
            Earn up to 20% APY on your crypto holdings
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <EmptyState icon="wifi-off" title="Failed to load" subtitle="Check your connection" />
      ) : (
        <FlatList
          data={pools ?? []}
          keyExtractor={(p) => p.id.toString()}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: botPt + 20 }}
          renderItem={({ item: p }) => {
            const bg = COIN_COLORS[p.coinSymbol?.toUpperCase()] ?? COIN_COLORS.DEFAULT;
            const apy = parseFloat(p.apy) || 0;
            return (
              <TouchableOpacity
                style={[styles.poolCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => isAuthenticated ? null : router.push("/login")}
                activeOpacity={0.8}
              >
                <View style={styles.poolTop}>
                  <View style={[styles.poolIcon, { backgroundColor: bg + "22" }]}>
                    <Text style={[styles.poolIconText, { color: bg }]}>
                      {p.coinSymbol?.charAt(0) ?? "?"}
                    </Text>
                  </View>
                  <View style={styles.poolInfo}>
                    <Text style={[styles.poolName, { color: colors.foreground }]}>{p.name}</Text>
                    <Text style={[styles.poolCoin, { color: colors.mutedForeground }]}>
                      {p.coinSymbol} • {p.flexible ? "Flexible" : `${p.duration}d Lock`}
                    </Text>
                  </View>
                  <View style={[styles.apyBadge, { backgroundColor: colors.success + "20" }]}>
                    <Text style={[styles.apyText, { color: colors.success }]}>{apy.toFixed(1)}% APY</Text>
                  </View>
                </View>
                <View style={[styles.poolDivider, { backgroundColor: colors.border }]} />
                <View style={styles.poolStats}>
                  <View style={styles.poolStat}>
                    <Text style={[styles.poolStatVal, { color: colors.foreground }]}>
                      {parseFloat(p.minAmount).toFixed(2)}
                    </Text>
                    <Text style={[styles.poolStatLabel, { color: colors.mutedForeground }]}>Min ({p.coinSymbol})</Text>
                  </View>
                  <View style={styles.poolStat}>
                    <Text style={[styles.poolStatVal, { color: colors.foreground }]}>
                      {(parseFloat(p.totalStaked) / 1000).toFixed(0)}K
                    </Text>
                    <Text style={[styles.poolStatLabel, { color: colors.mutedForeground }]}>Total Staked</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.stakeBtn, { backgroundColor: colors.primary }]}
                    onPress={() => isAuthenticated ? null : router.push("/login")}
                  >
                    <Text style={styles.stakeBtnLabel}>Stake</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <EmptyState icon="percent" title="No earn pools" subtitle="Check back soon for new opportunities" />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  bannerTitle: { fontSize: 15, fontWeight: "700" },
  bannerSub: { fontSize: 13, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  poolCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  poolTop: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  poolIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  poolIconText: { fontSize: 20, fontWeight: "700" },
  poolInfo: { flex: 1 },
  poolName: { fontSize: 15, fontWeight: "600" },
  poolCoin: { fontSize: 12, marginTop: 2 },
  apyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  apyText: { fontSize: 13, fontWeight: "700" },
  poolDivider: { height: StyleSheet.hairlineWidth },
  poolStats: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  poolStat: { flex: 1 },
  poolStatVal: { fontSize: 14, fontWeight: "600" },
  poolStatLabel: { fontSize: 11, marginTop: 2 },
  stakeBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  stakeBtnLabel: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
