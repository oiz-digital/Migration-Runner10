import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
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

interface AIPlan {
  id: number;
  name: string;
  description: string;
  roi: string;
  duration: number;
  minInvestment: string;
  maxInvestment: string;
  currency: string;
  status: string;
  riskLevel?: string;
}

const RISK_COLORS: Record<string, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#e81515",
};

export default function AITradingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: plans, isLoading, error } = useQuery({
    queryKey: ["ai-plans"],
    queryFn: () => apiFetch<AIPlan[]>("/api/ai/plan"),
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>AI Trading</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Hero banner */}
      <LinearGradient
        colors={["#1a0d00", "#0d1524"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { borderColor: colors.border }]}
      >
        <View style={styles.heroLeft}>
          <Text style={styles.heroTitle}>AI-Powered Trading</Text>
          <Text style={styles.heroSub}>
            Let our AI handle your trades while you sit back and earn
          </Text>
        </View>
        <View style={[styles.heroIcon, { backgroundColor: colors.primary + "30" }]}>
          <Feather name="cpu" size={32} color={colors.primary} />
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <EmptyState icon="wifi-off" title="Failed to load" subtitle="Check your connection" />
      ) : (
        <FlatList
          data={plans ?? []}
          keyExtractor={(p) => p.id.toString()}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: botPt + 20 }}
          renderItem={({ item: p }) => {
            const roi = parseFloat(p.roi) || 0;
            const risk = p.riskLevel?.toLowerCase() ?? "medium";
            const riskColor = RISK_COLORS[risk] ?? RISK_COLORS.medium;
            return (
              <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.planHeader}>
                  <View>
                    <Text style={[styles.planName, { color: colors.foreground }]}>{p.name}</Text>
                    {p.description ? (
                      <Text style={[styles.planDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
                        {p.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.planBadges}>
                    <View style={[styles.roiBadge, { backgroundColor: colors.success + "20" }]}>
                      <Text style={[styles.roiText, { color: colors.success }]}>+{roi.toFixed(1)}%</Text>
                    </View>
                    <View style={[styles.riskBadge, { backgroundColor: riskColor + "20" }]}>
                      <Text style={[styles.riskText, { color: riskColor, textTransform: "capitalize" }]}>{risk}</Text>
                    </View>
                  </View>
                </View>
                <View style={[styles.planDivider, { backgroundColor: colors.border }]} />
                <View style={styles.planDetails}>
                  <View style={styles.planDetail}>
                    <Feather name="clock" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.planDetailText, { color: colors.mutedForeground }]}>
                      {p.duration}d duration
                    </Text>
                  </View>
                  <View style={styles.planDetail}>
                    <Feather name="trending-up" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.planDetailText, { color: colors.mutedForeground }]}>
                      Min: {parseFloat(p.minInvestment).toFixed(0)} {p.currency}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.investBtn, { backgroundColor: colors.primary }]}
                  onPress={() => isAuthenticated ? null : router.push("/login")}
                >
                  <Text style={styles.investBtnLabel}>
                    {isAuthenticated ? "Invest Now" : "Login to Invest"}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState icon="cpu" title="No AI plans available" subtitle="Check back soon for new investment plans" />
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
  hero: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
  },
  heroLeft: { flex: 1 },
  heroTitle: { color: "#f8fafc", fontSize: 17, fontWeight: "800" },
  heroSub: { color: "#6b7a9e", fontSize: 13, marginTop: 4, lineHeight: 18 },
  heroIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  planCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  planHeader: { flexDirection: "row", padding: 14, gap: 12 },
  planName: { fontSize: 16, fontWeight: "700" },
  planDesc: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  planBadges: { alignItems: "flex-end", gap: 6 },
  roiBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  roiText: { fontSize: 13, fontWeight: "800" },
  riskBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  riskText: { fontSize: 11, fontWeight: "600" },
  planDivider: { height: StyleSheet.hairlineWidth },
  planDetails: { flexDirection: "row", gap: 16, paddingHorizontal: 14, paddingVertical: 10 },
  planDetail: { flexDirection: "row", alignItems: "center", gap: 4 },
  planDetailText: { fontSize: 12 },
  investBtn: { margin: 14, marginTop: 8, padding: 12, borderRadius: 8, alignItems: "center" },
  investBtnLabel: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
