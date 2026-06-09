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
import { apiFetch, apiPost } from "@/hooks/useApi";
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

interface EarnPos {
  id: number;
  pool: EarnPool;
  amount: string;
  earnings: string;
  startDate: string;
  status: string;
}

type Tab = "explore" | "mine";

const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", USDT: "#26a17b", BNB: "#f3ba2f",
  SOL: "#9945ff", ADA: "#3cc8c8", MATIC: "#8247e5", DEFAULT: "#eb9100",
};

export default function EarnScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("explore");
  const [modal, setModal] = useState<EarnPool | null>(null);
  const [stakeAmt, setStakeAmt] = useState("");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: pools, isLoading } = useQuery({
    queryKey: ["earn-pools"],
    queryFn: () => apiFetch<EarnPool[]>("/api/staking/pool"),
    staleTime: 60_000,
  });

  const { data: myPositions } = useQuery({
    queryKey: ["earn-positions"],
    queryFn: () => apiFetch<EarnPos[]>("/api/staking/position"),
    enabled: isAuthenticated,
  });

  const stakeMutation = useMutation({
    mutationFn: (body: object) => apiPost("/api/staking/position", body),
    onSuccess: () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModal(null);
      setStakeAmt("");
      void qc.invalidateQueries({ queryKey: ["earn-positions"] });
    },
  });

  const activePools = (pools ?? []).filter((p) => p.status === "active");
  const totalEarnings = (myPositions ?? []).reduce((s, p) => s + parseFloat(p.earnings || "0"), 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Earn</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Hero */}
      <LinearGradient
        colors={["#001a0f", "#0d1524"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { borderColor: "#003322" }]}
      >
        <View>
          <Text style={styles.heroTitle}>Earn Passive Income</Text>
          <Text style={styles.heroSub}>Stake your crypto and earn up to 120% APY</Text>
        </View>
        <View style={[styles.heroIcon, { backgroundColor: "#22c55e20" }]}>
          <Feather name="trending-up" size={32} color="#22c55e" />
        </View>
      </LinearGradient>

      {/* My earnings summary */}
      {isAuthenticated && (myPositions ?? []).length > 0 && (
        <View style={[styles.summaryRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryVal, { color: colors.success }]}>
              +${totalEarnings.toFixed(4)}
            </Text>
            <Text style={[styles.summaryLbl, { color: colors.mutedForeground }]}>Total Earnings</Text>
          </View>
          <View style={[styles.summarySep, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryVal, { color: colors.foreground }]}>
              {(myPositions ?? []).length}
            </Text>
            <Text style={[styles.summaryLbl, { color: colors.mutedForeground }]}>Active Positions</Text>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["explore", "mine"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, t === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, { color: t === tab ? colors.primary : colors.mutedForeground }]}>
              {t === "explore" ? "Earn Pools" : "My Positions"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "explore" ? (
        isLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
        ) : activePools.length === 0 ? (
          <EmptyState icon="percent" title="No pools available" subtitle="Check back soon for earning opportunities" />
        ) : (
          <FlatList
            data={activePools}
            keyExtractor={(p) => p.id.toString()}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: botPt + 20 }}
            renderItem={({ item: p }) => {
              const apy = parseFloat(p.apy || "0");
              const bg = COIN_COLORS[p.coinSymbol?.toUpperCase()] ?? COIN_COLORS.DEFAULT;
              const totalStaked = parseFloat(p.totalStaked || "0");
              return (
                <View style={[styles.poolCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.poolTop}>
                    <View style={[styles.poolIcon, { backgroundColor: bg + "22" }]}>
                      <Text style={[styles.poolIconText, { color: bg }]}>{(p.coinSymbol ?? "?").charAt(0)}</Text>
                    </View>
                    <View style={styles.poolInfo}>
                      <Text style={[styles.poolName, { color: colors.foreground }]}>{p.name}</Text>
                      <View style={styles.poolBadges}>
                        {p.flexible && (
                          <View style={[styles.badge, { backgroundColor: "#22c55e20" }]}>
                            <Text style={[styles.badgeText, { color: "#22c55e" }]}>Flexible</Text>
                          </View>
                        )}
                        {!p.flexible && (
                          <View style={[styles.badge, { backgroundColor: "#eb910020" }]}>
                            <Text style={[styles.badgeText, { color: "#eb9100" }]}>{p.duration}d Lock</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.poolApy}>
                      <Text style={[styles.poolApyVal, { color: "#22c55e" }]}>{apy.toFixed(1)}%</Text>
                      <Text style={[styles.poolApyLbl, { color: colors.mutedForeground }]}>APY</Text>
                    </View>
                  </View>

                  <View style={[styles.poolDivider, { backgroundColor: colors.border }]} />

                  <View style={styles.poolStats}>
                    <View style={styles.poolStat}>
                      <Text style={[styles.poolStatVal, { color: colors.foreground }]}>
                        {totalStaked >= 1e6 ? `${(totalStaked / 1e6).toFixed(2)}M` : totalStaked.toFixed(2)}
                      </Text>
                      <Text style={[styles.poolStatLbl, { color: colors.mutedForeground }]}>Total Staked</Text>
                    </View>
                    <View style={styles.poolStat}>
                      <Text style={[styles.poolStatVal, { color: colors.foreground }]}>
                        {parseFloat(p.minAmount).toFixed(2)}
                      </Text>
                      <Text style={[styles.poolStatLbl, { color: colors.mutedForeground }]}>Min Amount</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.stakeBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      if (!isAuthenticated) { router.push("/login"); return; }
                      setModal(p);
                      setStakeAmt("");
                    }}
                  >
                    <Feather name="plus-circle" size={14} color="#fff" />
                    <Text style={styles.stakeBtnLabel}>Stake {p.coinSymbol}</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )
      ) : (
        <FlatList
          data={myPositions ?? []}
          keyExtractor={(p) => p.id.toString()}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: botPt + 20, flexGrow: 1 }}
          ListEmptyComponent={
            !isAuthenticated
              ? <EmptyState icon="lock" title="Login required" subtitle="Sign in to view your positions" />
              : <EmptyState icon="percent" title="No positions yet" subtitle="Start staking to earn passive income" />
          }
          renderItem={({ item: pos }) => {
            const earnings = parseFloat(pos.earnings || "0");
            const bg = COIN_COLORS[pos.pool?.coinSymbol?.toUpperCase()] ?? COIN_COLORS.DEFAULT;
            return (
              <View style={[styles.posCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.posCardRow}>
                  <View style={[styles.poolIcon, { backgroundColor: bg + "22" }]}>
                    <Text style={[styles.poolIconText, { color: bg }]}>{(pos.pool?.coinSymbol ?? "?").charAt(0)}</Text>
                  </View>
                  <View style={styles.poolInfo}>
                    <Text style={[styles.poolName, { color: colors.foreground }]}>{pos.pool?.name ?? "Pool"}</Text>
                    <Text style={[styles.poolStatLbl, { color: colors.mutedForeground }]}>
                      Staked: {parseFloat(pos.amount).toFixed(4)} {pos.pool?.coinSymbol}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.poolApyVal, { color: colors.success, fontSize: 14 }]}>
                      +{earnings.toFixed(6)}
                    </Text>
                    <Text style={[styles.poolStatLbl, { color: colors.mutedForeground }]}>Earned</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Stake modal */}
      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModal(null)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Stake {modal?.coinSymbol}
              </Text>
              <TouchableOpacity onPress={() => setModal(null)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {modal && (
              <View style={{ padding: 20, gap: 16 }}>
                <View style={[styles.modalInfoRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={[styles.modalInfoLabel, { color: colors.mutedForeground }]}>APY</Text>
                  <Text style={[styles.modalInfoVal, { color: colors.success }]}>{parseFloat(modal.apy).toFixed(1)}%</Text>
                </View>
                <View style={[styles.amtRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.amtInput, { color: colors.foreground }]}
                    value={stakeAmt}
                    onChangeText={setStakeAmt}
                    placeholder="Enter amount"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                  />
                  <Text style={[styles.amtUnit, { color: colors.primary }]}>{modal.coinSymbol}</Text>
                </View>
                <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>
                  Min: {parseFloat(modal.minAmount).toFixed(2)} {modal.coinSymbol}
                  {!modal.flexible && ` • Lock: ${modal.duration} days`}
                </Text>
                {stakeMutation.isError && (
                  <Text style={{ color: colors.destructive, fontSize: 12 }}>
                    {(stakeMutation.error as Error).message}
                  </Text>
                )}
                <TouchableOpacity
                  style={[styles.stakeBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    if (!stakeAmt || parseFloat(stakeAmt) <= 0) return;
                    stakeMutation.mutate({ poolId: modal.id, amount: parseFloat(stakeAmt) });
                  }}
                  disabled={stakeMutation.isPending}
                >
                  {stakeMutation.isPending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.stakeBtnLabel}>Confirm Stake</Text>
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
  heroIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  summaryRow: { flexDirection: "row", marginHorizontal: 16, borderRadius: 12, borderWidth: 1, overflow: "hidden", marginBottom: 4 },
  summaryItem: { flex: 1, alignItems: "center", paddingVertical: 10 },
  summaryVal: { fontSize: 15, fontWeight: "700" },
  summaryLbl: { fontSize: 11, marginTop: 2 },
  summarySep: { width: StyleSheet.hairlineWidth },
  tabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 14, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  poolCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  poolTop: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  poolIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  poolIconText: { fontSize: 20, fontWeight: "800" },
  poolInfo: { flex: 1 },
  poolName: { fontSize: 15, fontWeight: "700" },
  poolBadges: { flexDirection: "row", gap: 6, marginTop: 3 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  poolApy: { alignItems: "center" },
  poolApyVal: { fontSize: 18, fontWeight: "900" },
  poolApyLbl: { fontSize: 10, marginTop: 1 },
  poolDivider: { height: StyleSheet.hairlineWidth },
  poolStats: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10, gap: 24 },
  poolStat: {},
  poolStatVal: { fontSize: 13, fontWeight: "700" },
  poolStatLbl: { fontSize: 11, marginTop: 1 },
  stakeBtn: { margin: 14, marginTop: 10, height: 44, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  stakeBtnLabel: { color: "#fff", fontSize: 14, fontWeight: "800" },
  posCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  posCardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: "700" },
  modalInfoRow: { flexDirection: "row", justifyContent: "space-between", padding: 12, borderRadius: 8, borderWidth: 1 },
  modalInfoLabel: { fontSize: 14 },
  modalInfoVal: { fontSize: 14, fontWeight: "700" },
  amtRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, height: 48, gap: 8 },
  amtInput: { flex: 1, fontSize: 18, fontWeight: "700" },
  amtUnit: { fontSize: 14, fontWeight: "700" },
  modalHint: { fontSize: 12, textAlign: "center" },
});
