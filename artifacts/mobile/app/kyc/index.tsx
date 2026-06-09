import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { EmptyState } from "@/components/EmptyState";

interface KycLevel {
  level: number;
  title: string;
  description: string;
  limits: string;
  requirements: string[];
  icon: keyof typeof Feather.glyphMap;
}

const KYC_LEVELS: KycLevel[] = [
  {
    level: 1,
    title: "Level 1 — Basic KYC",
    description: "Verify your PAN to unlock standard trading limits",
    limits: "₹50,000/day trading, ₹10,000/day withdrawal",
    requirements: ["PAN Card", "Email verification", "Phone number"],
    icon: "user",
  },
  {
    level: 2,
    title: "Level 2 — Enhanced KYC",
    description: "Aadhaar + selfie for higher limits and P2P trading",
    limits: "₹5,00,000/day trading, ₹1,00,000/day withdrawal",
    requirements: ["Aadhaar Card", "Live selfie", "Address proof"],
    icon: "shield",
  },
  {
    level: 3,
    title: "Level 3 — EDD",
    description: "Enhanced due diligence for institutional limits",
    limits: "Unlimited trading, ₹10,00,000/day withdrawal",
    requirements: ["Bank statement", "Source of funds", "Video call"],
    icon: "award",
  },
];

export default function KYCScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const currentLevel = user?.kycLevel ?? 0;

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>KYC Verification</Text>
          <View style={styles.backBtn} />
        </View>
        <EmptyState icon="lock" title="Login required" subtitle="Sign in to verify your identity" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>KYC Verification</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: botPt + 20 }}>
        {/* Current status */}
        <View style={[styles.statusCard, {
          backgroundColor: currentLevel > 0 ? colors.success + "15" : colors.warning + "15",
          borderColor: currentLevel > 0 ? colors.success + "40" : colors.warning + "40",
        }]}>
          <Feather
            name={currentLevel > 0 ? "check-circle" : "alert-circle"}
            size={20}
            color={currentLevel > 0 ? colors.success : colors.warning}
          />
          <View>
            <Text style={[styles.statusTitle, { color: colors.foreground }]}>
              {currentLevel === 0 ? "Not Verified" : `Level ${currentLevel} Verified`}
            </Text>
            <Text style={[styles.statusSub, { color: colors.mutedForeground }]}>
              {currentLevel === 0
                ? "Complete KYC to unlock full trading features"
                : `You are verified at Level ${currentLevel}`}
            </Text>
          </View>
        </View>

        {/* FIU-IND notice */}
        <View style={[styles.fuiNotice, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="info" size={14} color={colors.mutedForeground} />
          <Text style={[styles.fuiText, { color: colors.mutedForeground }]}>
            Zebvix is registered with FIU-IND under PMLA 2002. KYC is mandatory as per RBI and SEBI guidelines.
          </Text>
        </View>

        {/* KYC levels */}
        {KYC_LEVELS.map((lvl) => {
          const isComplete = currentLevel >= lvl.level;
          const isNext = currentLevel === lvl.level - 1;
          return (
            <View
              key={lvl.level}
              style={[
                styles.levelCard,
                { backgroundColor: colors.card, borderColor: isComplete ? colors.success : isNext ? colors.primary : colors.border },
              ]}
            >
              <View style={styles.levelHeader}>
                <View style={[styles.levelIcon, {
                  backgroundColor: isComplete
                    ? colors.success + "20"
                    : isNext
                      ? colors.primary + "20"
                      : colors.muted,
                }]}>
                  <Feather
                    name={isComplete ? "check" : lvl.icon}
                    size={20}
                    color={isComplete ? colors.success : isNext ? colors.primary : colors.mutedForeground}
                  />
                </View>
                <View style={styles.levelInfo}>
                  <Text style={[styles.levelTitle, { color: colors.foreground }]}>{lvl.title}</Text>
                  <Text style={[styles.levelDesc, { color: colors.mutedForeground }]}>{lvl.description}</Text>
                </View>
                {isComplete && (
                  <View style={[styles.completeBadge, { backgroundColor: colors.success + "20" }]}>
                    <Text style={[styles.completeBadgeText, { color: colors.success }]}>Done</Text>
                  </View>
                )}
              </View>

              <View style={[styles.levelDivider, { backgroundColor: colors.border }]} />

              <View style={styles.levelDetails}>
                <Text style={[styles.limitsTitle, { color: colors.mutedForeground }]}>Limits: {lvl.limits}</Text>
                <View style={styles.reqList}>
                  {lvl.requirements.map((r) => (
                    <View key={r} style={styles.reqRow}>
                      <Feather name="check-circle" size={13} color={isComplete ? colors.success : colors.mutedForeground} />
                      <Text style={[styles.reqText, { color: isComplete ? colors.success : colors.mutedForeground }]}>{r}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {isNext && (
                <TouchableOpacity
                  style={[styles.startBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {}}
                >
                  <Text style={styles.startBtnLabel}>Start Level {lvl.level} Verification</Text>
                  <Feather name="arrow-right" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
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
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  statusTitle: { fontSize: 15, fontWeight: "700" },
  statusSub: { fontSize: 13, marginTop: 2 },
  fuiNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  fuiText: { fontSize: 12, flex: 1, lineHeight: 16 },
  levelCard: { borderRadius: 12, borderWidth: 1.5, overflow: "hidden" },
  levelHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  levelIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  levelInfo: { flex: 1 },
  levelTitle: { fontSize: 14, fontWeight: "700" },
  levelDesc: { fontSize: 12, marginTop: 2 },
  completeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  completeBadgeText: { fontSize: 12, fontWeight: "700" },
  levelDivider: { height: StyleSheet.hairlineWidth },
  levelDetails: { padding: 14 },
  limitsTitle: { fontSize: 12, marginBottom: 8 },
  reqList: { gap: 6 },
  reqRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  reqText: { fontSize: 13 },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    margin: 14,
    marginTop: 0,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  startBtnLabel: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
