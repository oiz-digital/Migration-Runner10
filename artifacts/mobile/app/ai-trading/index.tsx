import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
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
import { apiFetch, apiPost } from "@/hooks/useApi";
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
  profitPercentage?: string;
}

interface AISub {
  id: number;
  plan: AIPlan;
  amount: string;
  profit: string;
  status: string;
  createdAt: string;
}

type Tab = "plans" | "my";

const RISK_META: Record<string, { color: string; icon: keyof typeof Feather.glyphMap; label: string }> = {
  low: { color: "#22c55e", icon: "shield", label: "Low Risk" },
  medium: { color: "#f59e0b", icon: "activity", label: "Medium Risk" },
  high: { color: "#e81515", icon: "zap", label: "High Risk" },
};

export default function AITradingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("plans");
  const [modal, setModal] = useState<AIPlan | null>(null);
  const [investAmt, setInvestAmt] = useState("");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["ai-plans"],
    queryFn: () => apiFetch<AIPlan[]>("/api/ai/plan"),
    staleTime: 60_000,
  });

  const { data: mySubs } = useQuery({
    queryKey: ["ai-subs"],
    queryFn: () => apiFetch<AISub[]>("/api/ai/investment"),
    enabled: isAuthenticated,
  });

  const subscribeMutation = useMutation({
    mutationFn: (body: object) => apiPost("/api/ai/investment", body),
    onSuccess: () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModal(null);
      setInvestAmt("");
      void qc.invalidateQueries({ queryKey: ["ai-subs"] });
    },
  });

  const activePlans = (plans ?? []).filter((p) => p.status === "active");
  const totalProfit = (mySubs ?? []).reduce((s, sub) => s + parseFloat(sub.profit || "0"), 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>AI Trading</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Hero */}
      <LinearGradient
        colors={["#0e0820", "#0d1524"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { borderColor: "#1a0a30" }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>AI-Powered Trading Bots</Text>
          <Text style={styles.heroSub}>Automated strategies, algorithmic execution, consistent returns</Text>
          {isAuthenticated && (mySubs ?? []).length > 0 && (
            <View style={styles.profitBadge}>
              <Feather name="trending-up" size={12} color="#22c55e" />
              <Text style={styles.profitBadgeText}>Earning: +${totalProfit.toFixed(2)}</Text>
            </View>
          )}
        </View>
        <View style={[styles.heroIcon, { backgroundColor: "#9945ff20" }]}>
          <Feather name="cpu" size={32} color="#9945ff" />
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["plans", "my"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, t === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, { color: t === tab ? colors.primary : colors.mutedForeground }]}>
              {t === "plans" ? "AI Plans" : "My Investments"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "plans" ? (
        isLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
        ) : activePlans.length === 0 ? (
          <EmptyState icon="cpu" title="No plans available" subtitle="AI trading plans coming soon" />
        ) : (
          <FlatList
            data={activePlans}
            keyExtractor={(p) => p.id.toString()}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: botPt + 20 }}
            renderItem={({ item: p }) => {
              const roi = parseFloat(p.roi || p.profitPercentage || "0");
              const risk = (p.riskLevel ?? "medium").toLowerCase();
              const riskMeta = RISK_META[risk] ?? RISK_META.medium;
              return (
                <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <LinearGradient
                    colors={[riskMeta.color + "10", "transparent"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.planGradient}
                  />
                  <View style={styles.planTop}>
                    <View style={[styles.planIconWrap, { backgroundColor: riskMeta.color + "20" }]}>
                      <Feather name={riskMeta.icon} size={22} color={riskMeta.color} />
                    </View>
                    <View style={styles.planInfo}>
                      <Text style={[styles.planName, { color: colors.foreground }]}>{p.name}</Text>
                      <View style={[styles.riskBadge, { backgroundColor: riskMeta.color + "20" }]}>
                        <Text style={[styles.riskBadgeText, { color: riskMeta.color }]}>{riskMeta.label}</Text>
                      </View>
                    </View>
                    <View style={styles.planRoi}>
                      <Text style={[styles.planRoiVal, { color: riskMeta.color }]}>+{roi.toFixed(1)}%</Text>
                      <Text style={[styles.planRoiLbl, { color: colors.mutedForeground }]}>
                        in {p.duration}d
                      </Text>
                    </View>
                  </View>

                  {p.description ? (
                    <Text style={[styles.planDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
                      {p.description}
                    </Text>
                  ) : null}

                  <View style={styles.planStats}>
                    <View style={[styles.planStatItem, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.planStatVal, { color: colors.foreground }]}>
                        {parseFloat(p.minInvestment).toFixed(0)} {p.currency}
                      </Text>
                      <Text style={[styles.planStatLbl, { color: colors.mutedForeground }]}>Min Invest</Text>
                    </View>
                    <View style={[styles.planStatItem, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.planStatVal, { color: colors.foreground }]}>
                        {p.duration}d
                      </Text>
                      <Text style={[styles.planStatLbl, { color: colors.mutedForeground }]}>Duration</Text>
                    </View>
                    <View style={[styles.planStatItem, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.planStatVal, { color: colors.foreground }]}>
                        {p.currency}
                      </Text>
                      <Text style={[styles.planStatLbl, { color: colors.mutedForeground }]}>Currency</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.investBtn, { backgroundColor: riskMeta.color }]}
                    onPress={() => {
                      if (!isAuthenticated) { router.push("/login"); return; }
                      setModal(p);
                      setInvestAmt("");
                    }}
                  >
                    <Feather name="trending-up" size={14} color="#fff" />
                    <Text style={styles.investBtnLabel}>Invest Now</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )
      ) : (
        <FlatList
          data={mySubs ?? []}
          keyExtractor={(s) => s.id.toString()}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: botPt + 20, flexGrow: 1 }}
          ListEmptyComponent={
            !isAuthenticated
              ? <EmptyState icon="lock" title="Login required" />
              : <EmptyState icon="cpu" title="No investments yet" subtitle="Pick an AI plan to start" />
          }
          renderItem={({ item: sub }) => {
            const profit = parseFloat(sub.profit || "0");
            const risk = (sub.plan?.riskLevel ?? "medium").toLowerCase();
            const meta = RISK_META[risk] ?? RISK_META.medium;
            return (
              <View style={[styles.subCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.subRow}>
                  <View style={[styles.planIconWrap, { backgroundColor: meta.color + "20" }]}>
                    <Feather name={meta.icon} size={18} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planName, { color: colors.foreground }]}>{sub.plan?.name ?? "Plan"}</Text>
                    <Text style={[styles.planStatLbl, { color: colors.mutedForeground }]}>
                      ${parseFloat(sub.amount).toFixed(2)} invested
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.subProfit, { color: profit >= 0 ? colors.success : colors.destructive }]}>
                      {profit >= 0 ? "+" : ""}${Math.abs(profit).toFixed(4)}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: sub.status === "active" ? "#22c55e20" : colors.muted }]}>
                      <Text style={[styles.statusText, { color: sub.status === "active" ? colors.success : colors.mutedForeground }]}>
                        {sub.status}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Subscribe modal */}
      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModal(null)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Invest in {modal?.name}</Text>
              <TouchableOpacity onPress={() => setModal(null)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {modal && (
              <View style={{ padding: 20, gap: 14 }}>
                <View style={[styles.modalInfoRow, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.modalInfoLabel, { color: colors.mutedForeground }]}>Expected ROI</Text>
                  <Text style={[styles.modalInfoVal, { color: colors.success }]}>
                    +{parseFloat(modal.roi || modal.profitPercentage || "0").toFixed(1)}% in {modal.duration}d
                  </Text>
                </View>
                <View style={[styles.amtRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.amtInput, { color: colors.foreground }]}
                    value={investAmt}
                    onChangeText={setInvestAmt}
                    placeholder="Enter amount"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                  <Text style={[styles.amtUnit, { color: colors.primary }]}>{modal.currency}</Text>
                </View>
                <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>
                  Min: {parseFloat(modal.minInvestment).toFixed(2)} {modal.currency} • Max: {parseFloat(modal.maxInvestment).toFixed(2)}
                </Text>
                {subscribeMutation.isError && (
                  <Text style={{ color: colors.destructive, fontSize: 12 }}>
                    {(subscribeMutation.error as Error).message}
                  </Text>
                )}
                <TouchableOpacity
                  style={[styles.investBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    if (!investAmt || parseFloat(investAmt) <= 0) return;
                    subscribeMutation.mutate({ planId: modal.id, amount: parseFloat(investAmt) });
                  }}
                  disabled={subscribeMutation.isPending}
                >
                  {subscribeMutation.isPending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.investBtnLabel}>Confirm Investment</Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  hero: { flexDirection: "row", alignItems: "center", margin: 16, padding: 18, borderRadius: 16, borderWidth: 1, gap: 16 },
  heroTitle: { color: "#f8fafc", fontSize: 16, fontWeight: "800" },
  heroSub: { color: "#6b7a9e", fontSize: 12, marginTop: 4, lineHeight: 16 },
  profitBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, backgroundColor: "#22c55e20", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: "flex-start" },
  profitBadgeText: { color: "#22c55e", fontSize: 12, fontWeight: "700" },
  heroIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 14, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  planCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden", position: "relative" },
  planGradient: { ...StyleSheet.absoluteFillObject },
  planTop: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  planIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  planInfo: { flex: 1 },
  planName: { fontSize: 15, fontWeight: "700" },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, alignSelf: "flex-start", marginTop: 3 },
  riskBadgeText: { fontSize: 11, fontWeight: "700" },
  planRoi: { alignItems: "center" },
  planRoiVal: { fontSize: 20, fontWeight: "900" },
  planRoiLbl: { fontSize: 11, marginTop: 1 },
  planDesc: { paddingHorizontal: 14, fontSize: 13, lineHeight: 18, marginBottom: 6 },
  planStats: { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginBottom: 12 },
  planStatItem: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8 },
  planStatVal: { fontSize: 13, fontWeight: "700" },
  planStatLbl: { fontSize: 10, marginTop: 2 },
  investBtn: { margin: 14, marginTop: 0, height: 44, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  investBtnLabel: { color: "#fff", fontSize: 14, fontWeight: "800" },
  subCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  subProfit: { fontSize: 15, fontWeight: "800" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginTop: 3 },
  statusText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: "700" },
  modalInfoRow: { flexDirection: "row", justifyContent: "space-between", padding: 12, borderRadius: 8 },
  modalInfoLabel: { fontSize: 14 },
  modalInfoVal: { fontSize: 14, fontWeight: "700" },
  amtRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, height: 48, gap: 8 },
  amtInput: { flex: 1, fontSize: 18, fontWeight: "700" },
  amtUnit: { fontSize: 14, fontWeight: "700" },
  modalHint: { fontSize: 12, textAlign: "center" },
});
