import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
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

interface SettingRow {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const kycLabels = ["Not Verified", "Level 1", "Level 2", "Level 3 (EDD)"];
  const kycColors = ["#e81515", "#f59e0b", "#22c55e", "#22c55e"];

  const handleLogout = () => {
    if (Platform.OS === "web") {
      void logout();
    } else {
      Alert.alert("Logout", "Are you sure you want to logout?", [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", style: "destructive", onPress: () => void logout() },
      ]);
    }
  };

  const SETTINGS: SettingRow[] = isAuthenticated
    ? [
        { icon: "shield", label: "KYC Verification", value: kycLabels[user?.kycLevel ?? 0], onPress: () => router.push("/kyc") },
        { icon: "lock", label: "Security", onPress: () => {} },
        { icon: "bell", label: "Notifications", onPress: () => {} },
        { icon: "link", label: "Referral Program", onPress: () => {} },
        { icon: "help-circle", label: "Support", onPress: () => {} },
        { icon: "file-text", label: "Terms of Service", onPress: () => {} },
        { icon: "log-out", label: "Logout", onPress: handleLogout, danger: true },
      ]
    : [
        { icon: "log-in", label: "Login", onPress: () => router.push("/login") },
        { icon: "user-plus", label: "Create Account", onPress: () => router.push("/register") },
        { icon: "help-circle", label: "Support", onPress: () => {} },
        { icon: "file-text", label: "Terms of Service", onPress: () => {} },
      ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPt, paddingBottom: botPt + 80 }}
    >
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + "30" }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {user ? user.name.charAt(0).toUpperCase() : "Z"}
          </Text>
        </View>
        {isAuthenticated ? (
          <>
            <Text style={[styles.userName, { color: colors.foreground }]}>{user?.name ?? ""}</Text>
            <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{user?.email ?? ""}</Text>
            <View style={[styles.kycBadge, { backgroundColor: (kycColors[user?.kycLevel ?? 0]) + "20" }]}>
              <View style={[styles.kycDot, { backgroundColor: kycColors[user?.kycLevel ?? 0] }]} />
              <Text style={[styles.kycLabel, { color: kycColors[user?.kycLevel ?? 0] }]}>
                KYC: {kycLabels[user?.kycLevel ?? 0]}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.userName, { color: colors.foreground }]}>Guest</Text>
            <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>Login to access all features</Text>
          </>
        )}
      </View>

      {/* Stats row */}
      {isAuthenticated && (
        <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { label: "VIP Tier", value: `Tier ${user?.vipTier ?? 0}` },
            { label: "Referrals", value: `${user?.referralCount ?? 0}` },
            { label: "2FA", value: user?.twoFaEnabled ? "On" : "Off" },
          ].map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Settings list */}
      <View style={[styles.settingsList, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {SETTINGS.map((s, i) => (
          <React.Fragment key={s.label}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={s.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.settingIcon, { backgroundColor: (s.danger ? colors.destructive : colors.primary) + "15" }]}>
                <Feather name={s.icon} size={18} color={s.danger ? colors.destructive : colors.primary} />
              </View>
              <Text style={[styles.settingLabel, { color: s.danger ? colors.destructive : colors.foreground }]}>
                {s.label}
              </Text>
              <View style={styles.settingRight}>
                {s.value ? <Text style={[styles.settingValue, { color: colors.mutedForeground }]}>{s.value}</Text> : null}
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </View>
            </TouchableOpacity>
            {i < SETTINGS.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
          </React.Fragment>
        ))}
      </View>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>Zebvix v1.0.0 • FIU-IND Compliant</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  avatarSection: { alignItems: "center", paddingVertical: 24, gap: 6 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  avatarText: { fontSize: 32, fontWeight: "800" },
  userName: { fontSize: 20, fontWeight: "700" },
  userEmail: { fontSize: 14 },
  kycBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
    marginTop: 4,
  },
  kycDot: { width: 8, height: 8, borderRadius: 4 },
  kycLabel: { fontSize: 13, fontWeight: "600" },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 16 },
  statValue: { fontSize: 16, fontWeight: "700" },
  statLabel: { fontSize: 12, marginTop: 2 },
  settingsList: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 24,
  },
  settingRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  settingIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  settingLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  settingValue: { fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  version: { textAlign: "center", fontSize: 12, marginBottom: 8 },
});
