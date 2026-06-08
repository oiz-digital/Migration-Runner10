import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, Switch, Modal, TextInput, Alert
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/context/ThemeContext";

const VIP_LEVELS = [
  { level:0, vol:"0",   fee:"0.10/0.10", reward:"Standard" },
  { level:1, vol:"1M",  fee:"0.09/0.10", reward:"Priority Support" },
  { level:2, vol:"5M",  fee:"0.08/0.09", reward:"Exclusive Events" },
  { level:3, vol:"10M", fee:"0.07/0.08", reward:"Personal Account Manager" },
];

const TRADING_STATS = [
  { label:"30D Volume",  value:"$12,847.00" },
  { label:"30D Trades",  value:"148" },
  { label:"Win Rate",    value:"62.8%" },
  { label:"Best Trade",  value:"+$234.50" },
];

const DEVICES = [
  { name:"iPhone 15 Pro",  location:"Mumbai, IN",   time:"Active now",    current:true },
  { name:"MacBook Air M2", location:"Mumbai, IN",   time:"2 hours ago",   current:false },
  { name:"iPad Pro",       location:"Delhi, IN",    time:"3 days ago",    current:false },
];

const ACHIEVEMENTS = [
  { icon:"zap",       label:"First Trade",  unlocked:true  },
  { icon:"trending-up",label:"10% Profit",  unlocked:true  },
  { icon:"award",     label:"Top Trader",   unlocked:false },
  { icon:"shield",    label:"Verified KYC", unlocked:true  },
  { icon:"users",     label:"5 Referrals",  unlocked:false },
  { icon:"star",      label:"VIP Member",   unlocked:false },
];

export default function AccountScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated, logout } = useAuth();
  const { mode: themeMode, scheme: themeScheme, cycleMode } = useTheme();
  const themeLabel = themeMode === "auto" ? `Auto (${themeScheme === "dark" ? "Dark" : "Light"})` : themeMode === "dark" ? "Dark" : "Light";
  const themeIcon = themeMode === "auto" ? "smartphone" : themeMode === "dark" ? "moon" : "sun";
  const onCycleTheme = () => { Haptics.selectionAsync(); cycleMode(); };
  const [biometric, setBiometric] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [priceAlert, setPriceAlert] = useState(false);
  const [autoInvest, setAutoInvest] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);
  const [activeSection, setActiveSection] = useState<string|null>(null);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;
  const vipProgress = 12847 / 1000000;
  const REFERRAL_CODE = "CXUSER8421";

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => logout() },
    ]);
  };

  const displayName = user ? (user.firstName ? `${user.firstName}` : user.email.split("@")[0]) : "CryptoX User";
  const displayEmail = user?.email ?? "user@cryptox.com";
  const displayInitials = displayName.slice(0, 2).toUpperCase();

  const sections = [
    {
      title: "Security & Verification",
      items: [
        { icon:"shield", label:"Identity Verification", type:"badge" as const, badge:"Verified", badgeColor: colors.success },
        { icon:"key",    label:"Change Password",       type:"nav" as const },
        { icon:"smartphone",label:"Biometric Login",   type:"toggle" as const, stateKey:"biometric" },
        { icon:"lock",   label:"Two-Factor Auth (2FA)", type:"action" as const, value:"Enabled", actionLabel:"Manage", action:()=>setShow2FAModal(true) },
        { icon:"wifi-off",label:"Anti-Phishing Code",  type:"nav" as const, value:"Enabled" },
        { icon:"alert-circle",label:"Withdrawal Whitelist",type:"nav" as const,value:"2 addresses" },
      ],
    },
    {
      title: "Account & Assets",
      items: [
        { icon:"dollar-sign",label:"Referral Program", type:"nav" as const, value:"Earn 40%" },
        { icon:"credit-card",label:"Payment Methods",  type:"nav" as const },
        { icon:"code",       label:"API Management",   type:"action" as const, value:"2 keys", actionLabel:"View", action:()=>setShowApiModal(true) },
        { icon:"activity",   label:"Login Activity",   type:"nav" as const },
        { icon:"gift",       label:"Rewards Center",   type:"badge" as const, badge:"3 New", badgeColor:colors.primary },
      ],
    },
    {
      title: "Preferences",
      items: [
        { icon:"bell",        label:"Push Notifications", type:"toggle" as const, stateKey:"notifications" },
        { icon:"trending-up", label:"Price Alerts",       type:"toggle" as const, stateKey:"priceAlert" },
        { icon:"repeat",      label:"Auto-Invest",        type:"toggle" as const, stateKey:"autoInvest" },
        { icon:"globe",       label:"Language",           type:"nav" as const, value:"English (US)" },
        { icon:"dollar-sign", label:"Currency",           type:"nav" as const, value:"USD ($)" },
        { icon:themeIcon,     label:"Theme",              type:"action" as const, value:themeLabel, actionLabel:"Switch", action:onCycleTheme },
      ],
    },
    {
      title: "Help & Legal",
      items: [
        { icon:"help-circle",   label:"Help Center",        type:"nav" as const },
        { icon:"message-circle",label:"Live Chat Support",  type:"badge" as const, badge:"Online", badgeColor:colors.success },
        { icon:"book",          label:"Trading Guide",      type:"nav" as const },
        { icon:"file-text",     label:"Terms of Service",   type:"nav" as const },
        { icon:"eye",           label:"Privacy Policy",     type:"nav" as const },
        { icon:"info",          label:"About CryptoX",      type:"nav" as const, value:"v1.0.0" },
      ],
    },
  ] as const;

  const getToggle = (key: string) => {
    if(key==="biometric") return biometric;
    if(key==="notifications") return notifications;
    if(key==="priceAlert") return priceAlert;
    if(key==="autoInvest") return autoInvest;
    return false;
  };
  const setToggle = (key: string, v: boolean) => {
    Haptics.selectionAsync();
    if(key==="biometric") setBiometric(v);
    if(key==="notifications") setNotifications(v);
    if(key==="priceAlert") setPriceAlert(v);
    if(key==="autoInvest") setAutoInvest(v);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Platform.OS==="web" ? bottomPad+84 : 90 }}>

        {/* Profile header */}
        <View style={[styles.profileCard, { paddingTop: topPad+12, backgroundColor: colors.card }]}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, { backgroundColor: colors.primary+"22" }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>{displayInitials}</Text>
            </View>
            <View style={[styles.verifiedBadge, { backgroundColor: colors.success }]}>
              <Feather name="check" size={8} color="#fff" />
            </View>
          </View>
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.profileName, { color: colors.foreground }]}>{displayName}</Text>
              <View style={[styles.vipBadge, { backgroundColor: colors.primary+"22" }]}>
                <Text style={[styles.vipText, { color: colors.primary }]}>VIP 0</Text>
              </View>
            </View>
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{displayEmail}</Text>
            <Text style={[styles.profileUid, { color: colors.mutedForeground }]}>KYC: {user?.kycStatus ?? "Pending"}</Text>
          </View>
          <TouchableOpacity style={[styles.editBtn, { borderColor: colors.border }]}>
            <Feather name="edit-2" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Fee + Stats */}
        <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { label:"Maker Fee", value:"0.10%" },
            { label:"Taker Fee", value:"0.10%" },
            { label:"30D Volume", value:"$12.8K" },
            { label:"Open PnL",  value:"+$137.25", color: colors.success },
          ].map((s, i) => (
            <View key={s.label} style={[styles.statItem, { borderLeftWidth:i>0?1:0, borderLeftColor:colors.border }]}>
              <Text style={[styles.statValue, { color: s.color || colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* VIP Progress */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.vipHeader}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>VIP Program</Text>
            <Text style={[styles.vipCurrentLabel, { color: colors.primary }]}>VIP 0 → VIP 1</Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: colors.secondary }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.primary, width:`${vipProgress*100}%` as any }]} />
          </View>
          <View style={styles.vipRow}>
            <Text style={[styles.vipSub, { color: colors.mutedForeground }]}>$12,847 / $1,000,000 30D Vol</Text>
            <Text style={[styles.vipBenefit, { color: colors.primary }]}>+$987K to VIP 1</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {VIP_LEVELS.map(l => (
              <View key={l.level} style={[styles.vipCard, {
                backgroundColor: l.level===0 ? colors.primary+"18" : colors.secondary,
                borderColor: l.level===0 ? colors.primary : colors.border,
              }]}>
                <Text style={[styles.vipCardLevel, { color: l.level===0?colors.primary:colors.foreground }]}>VIP {l.level}</Text>
                <Text style={[styles.vipCardVol, { color: colors.mutedForeground }]}>{l.vol} Vol</Text>
                <Text style={[styles.vipCardFee, { color: colors.foreground }]}>{l.fee}%</Text>
                <Text style={[styles.vipCardReward, { color: colors.mutedForeground }]}>{l.reward}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Referral Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.referralHeader}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Referral Program</Text>
              <Text style={[styles.referralSub, { color: colors.mutedForeground }]}>Earn up to 40% commission</Text>
            </View>
            <Feather name="users" size={22} color={colors.primary} />
          </View>
          <View style={styles.referralStats}>
            {[
              { label:"Invited",  value:"3" },
              { label:"Earned",   value:"$18.42" },
              { label:"Rate",     value:"20%" },
            ].map(s => (
              <View key={s.label} style={[styles.refStat, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[styles.refStatV, { color: colors.foreground }]}>{s.value}</Text>
                <Text style={[styles.refStatL, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.codeRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={[styles.codeLabel, { color: colors.mutedForeground }]}>Referral Code</Text>
            <Text style={[styles.codeValue, { color: colors.primary }]}>{REFERRAL_CODE}</Text>
            <TouchableOpacity onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              style={[styles.copyBtn, { backgroundColor: colors.primary+"22" }]}>
              <Feather name="copy" size={13} color={colors.primary} />
              <Text style={[styles.copyTxt, { color: colors.primary }]}>Copy</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Trading Stats */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, marginBottom:12 }]}>Trading Statistics</Text>
          <View style={styles.statsGrid}>
            {TRADING_STATS.map(s => (
              <View key={s.label} style={[styles.statBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[styles.statBoxV, { color: colors.foreground }]}>{s.value}</Text>
                <Text style={[styles.statBoxL, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Achievements */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, marginBottom:12 }]}>Achievements</Text>
          <View style={styles.achieveGrid}>
            {ACHIEVEMENTS.map(a => (
              <View key={a.label} style={[styles.achieveItem, {
                backgroundColor: a.unlocked ? colors.primary+"14" : colors.secondary,
                borderColor: a.unlocked ? colors.primary+"60" : colors.border,
                opacity: a.unlocked ? 1 : 0.55,
              }]}>
                <Feather name={a.icon as any} size={20} color={a.unlocked ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.achieveLabel, { color: a.unlocked ? colors.foreground : colors.mutedForeground }]}>{a.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Active Devices */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, marginBottom:12 }]}>Active Devices</Text>
          {DEVICES.map((d, i) => (
            <View key={d.name} style={[styles.deviceRow, { borderTopColor: colors.border, borderTopWidth: i>0?1:0 }]}>
              <View style={[styles.deviceIcon, { backgroundColor: colors.secondary }]}>
                <Feather name={d.name.includes("MacBook")?"monitor":d.name.includes("iPad")?"tablet":"smartphone"} size={16} color={d.current?colors.primary:colors.mutedForeground} />
              </View>
              <View style={{ flex:1 }}>
                <View style={styles.deviceNameRow}>
                  <Text style={[styles.deviceName, { color: colors.foreground }]}>{d.name}</Text>
                  {d.current && (
                    <View style={[styles.currentBadge, { backgroundColor: colors.success+"22" }]}>
                      <Text style={[styles.currentBadgeTxt, { color: colors.success }]}>Current</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.deviceLoc, { color: colors.mutedForeground }]}>{d.location} · {d.time}</Text>
              </View>
              {!d.current && (
                <TouchableOpacity onPress={() => Haptics.selectionAsync()}>
                  <Text style={[styles.revokeBtn, { color: colors.destructive }]}>Revoke</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Settings Sections */}
        {sections.map(section => (
          <View key={section.title} style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{section.title}</Text>
            {section.items.map((item, i) => (
              <TouchableOpacity key={item.label}
                testID={`setting-${item.label.replace(/\s+/g,"-").toLowerCase()}`}
                onPress={() => {
                  if(item.type==="action" && "action" in item) { item.action(); return; }
                  if(item.type !== "toggle") Haptics.selectionAsync();
                }}
                activeOpacity={item.type==="toggle"?1:0.7}
                style={[styles.settingRow, { borderTopColor:colors.border, borderTopWidth:i>0?1:0 }]}
              >
                <View style={[styles.settingIcon, { backgroundColor: colors.secondary }]}>
                  <Feather name={item.icon as any} size={15} color={colors.primary} />
                </View>
                <Text style={[styles.settingLabel, { color: colors.foreground }]}>{item.label}</Text>
                <View style={styles.settingRight}>
                  {"value" in item && item.value && item.type!=="action" && (
                    <Text style={[styles.settingValue, { color: colors.mutedForeground }]}>{item.value}</Text>
                  )}
                  {item.type === "badge" && "badge" in item && (
                    <View style={[styles.badge, { backgroundColor: (item.badgeColor||colors.success)+"22" }]}>
                      <Text style={[styles.badgeText, { color: item.badgeColor||colors.success }]}>{item.badge}</Text>
                    </View>
                  )}
                  {item.type === "toggle" && "stateKey" in item && (
                    <Switch
                      value={getToggle(item.stateKey)}
                      onValueChange={v => setToggle(item.stateKey, v)}
                      trackColor={{ false: colors.border, true: colors.primary+"80" }}
                      thumbColor={getToggle(item.stateKey) ? colors.primary : colors.mutedForeground}
                    />
                  )}
                  {item.type === "action" && "actionLabel" in item && (
                    <View style={[styles.actionBadge, { borderColor: colors.primary }]}>
                      <Text style={[styles.actionBadgeTxt, { color: colors.primary }]}>{item.actionLabel}</Text>
                    </View>
                  )}
                  {item.type === "nav" && <Feather name="chevron-right" size={14} color={colors.mutedForeground} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {/* Logout */}
        <TouchableOpacity testID="btn-logout"
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleLogout(); }}
          style={[styles.logoutBtn, { backgroundColor: colors.card, borderColor: colors.destructive+"40" }]}>
          <Feather name="log-out" size={16} color={colors.destructive} />
          <Text style={[styles.logoutText, { color: colors.destructive }]}>{isAuthenticated ? "Sign Out" : "Sign In"}</Text>
        </TouchableOpacity>

        <Text style={[styles.versionText, { color: colors.mutedForeground }]}>CryptoX Mobile v1.0.0 · Build 2024</Text>
      </ScrollView>

      {/* 2FA Modal */}
      <Modal visible={show2FAModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Two-Factor Auth</Text>
            <View style={[styles.twoFaStatus, { backgroundColor: colors.success+"18", borderColor: colors.success+"40" }]}>
              <Feather name="check-circle" size={18} color={colors.success} />
              <Text style={[styles.twoFaStatusTxt, { color: colors.success }]}>Authenticator App Enabled</Text>
            </View>
            {[
              { icon:"smartphone", label:"Authenticator App", enabled:true },
              { icon:"message-square", label:"SMS Authentication", enabled:false },
              { icon:"mail", label:"Email Authentication", enabled:true },
            ].map((m,i) => (
              <View key={m.label} style={[styles.twoFaMethod, { borderTopColor: colors.border, borderTopWidth: i>0?1:0 }]}>
                <Feather name={m.icon as any} size={16} color={m.enabled?colors.success:colors.mutedForeground} />
                <Text style={[styles.twoFaMethodTxt, { color: colors.foreground }]}>{m.label}</Text>
                <View style={[styles.enabledBadge, { backgroundColor: m.enabled?colors.success+"18":colors.secondary }]}>
                  <Text style={[styles.enabledBadgeTxt, { color: m.enabled?colors.success:colors.mutedForeground }]}>
                    {m.enabled?"On":"Off"}
                  </Text>
                </View>
              </View>
            ))}
            <TouchableOpacity onPress={() => setShow2FAModal(false)} style={[styles.closeModalBtn, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.closeModalTxt, { color: colors.mutedForeground }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* API Modal */}
      <Modal visible={showApiModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>API Management</Text>
            {[
              { name:"Trading Bot Key",     created:"Apr 10 2024", perms:"Read, Trade",      lastUsed:"2 min ago" },
              { name:"Portfolio Tracker",   created:"Mar 22 2024", perms:"Read Only",        lastUsed:"1 day ago" },
            ].map((k,i) => (
              <View key={k.name} style={[styles.apiKey, { borderTopColor: colors.border, borderTopWidth: i>0?1:0 }]}>
                <Feather name="key" size={15} color={colors.primary} />
                <View style={{ flex:1, marginLeft:10 }}>
                  <Text style={[styles.apiKeyName, { color: colors.foreground }]}>{k.name}</Text>
                  <Text style={[styles.apiKeyMeta, { color: colors.mutedForeground }]}>{k.perms} · {k.lastUsed}</Text>
                  <Text style={[styles.apiKeyDate, { color: colors.mutedForeground }]}>Created {k.created}</Text>
                </View>
                <TouchableOpacity onPress={() => Haptics.selectionAsync()}>
                  <Feather name="trash-2" size={15} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={[styles.createApiBtn, { backgroundColor: colors.primary+"18", borderColor: colors.primary }]}>
              <Feather name="plus" size={14} color={colors.primary} />
              <Text style={[styles.createApiTxt, { color: colors.primary }]}>Create New API Key</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowApiModal(false)} style={[styles.closeModalBtn, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.closeModalTxt, { color: colors.mutedForeground }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1 },
  profileCard: { flexDirection:"row", alignItems:"center", paddingHorizontal:20, paddingBottom:20, gap:14 },
  avatarWrap: { position:"relative" },
  avatar: { width:66, height:66, borderRadius:33, alignItems:"center", justifyContent:"center" },
  avatarText: { fontSize:22, fontFamily:"Inter_700Bold" },
  verifiedBadge: { position:"absolute", bottom:0, right:0, width:18, height:18, borderRadius:9, alignItems:"center", justifyContent:"center", borderWidth:2, borderColor:"#0b0e11" },
  profileInfo: { flex:1 },
  nameRow: { flexDirection:"row", alignItems:"center", gap:8, marginBottom:2 },
  profileName: { fontSize:18, fontFamily:"Inter_700Bold" },
  vipBadge: { paddingHorizontal:8, paddingVertical:2, borderRadius:6 },
  vipText: { fontSize:10, fontFamily:"Inter_700Bold" },
  profileEmail: { fontSize:12, fontFamily:"Inter_400Regular" },
  profileUid: { fontSize:10, fontFamily:"Inter_400Regular", marginTop:2 },
  editBtn: { width:34, height:34, borderRadius:17, alignItems:"center", justifyContent:"center", borderWidth:1 },
  statsRow: { flexDirection:"row", marginHorizontal:8, marginBottom:4, borderRadius:14, borderWidth:1, overflow:"hidden" },
  statItem: { flex:1, alignItems:"center", paddingVertical:12 },
  statValue: { fontSize:11, fontFamily:"Inter_700Bold", marginBottom:2 },
  statLabel: { fontSize:9, fontFamily:"Inter_400Regular" },
  card: { margin:8, borderRadius:14, borderWidth:1, padding:14 },
  cardTitle: { fontSize:14, fontFamily:"Inter_600SemiBold" },
  vipHeader: { flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:8 },
  vipCurrentLabel: { fontSize:11, fontFamily:"Inter_600SemiBold" },
  progressBar: { height:6, borderRadius:3, overflow:"hidden", marginBottom:4 },
  progressFill: { height:6, borderRadius:3 },
  vipRow: { flexDirection:"row", justifyContent:"space-between" },
  vipSub: { fontSize:10, fontFamily:"Inter_400Regular" },
  vipBenefit: { fontSize:10, fontFamily:"Inter_600SemiBold" },
  vipCard: { borderRadius:10, borderWidth:1, padding:10, marginRight:8, minWidth:90, alignItems:"center", gap:3 },
  vipCardLevel: { fontSize:12, fontFamily:"Inter_700Bold" },
  vipCardVol: { fontSize:9, fontFamily:"Inter_400Regular" },
  vipCardFee: { fontSize:11, fontFamily:"Inter_600SemiBold" },
  vipCardReward: { fontSize:8.5, fontFamily:"Inter_400Regular", textAlign:"center" },
  referralHeader: { flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:12 },
  referralSub: { fontSize:11, fontFamily:"Inter_400Regular", marginTop:2 },
  referralStats: { flexDirection:"row", gap:8, marginBottom:10 },
  refStat: { flex:1, alignItems:"center", paddingVertical:10, borderRadius:10, borderWidth:1 },
  refStatV: { fontSize:14, fontFamily:"Inter_700Bold" },
  refStatL: { fontSize:9.5, fontFamily:"Inter_400Regular", marginTop:2 },
  codeRow: { flexDirection:"row", alignItems:"center", borderRadius:10, borderWidth:1, paddingHorizontal:12, paddingVertical:10 },
  codeLabel: { fontSize:11, fontFamily:"Inter_400Regular", marginRight:8 },
  codeValue: { flex:1, fontSize:14, fontFamily:"Inter_700Bold" },
  copyBtn: { flexDirection:"row", alignItems:"center", gap:5, paddingHorizontal:10, paddingVertical:6, borderRadius:8 },
  copyTxt: { fontSize:11, fontFamily:"Inter_600SemiBold" },
  statsGrid: { flexDirection:"row", flexWrap:"wrap", gap:8 },
  statBox: { width:"47%", borderRadius:10, borderWidth:1, padding:10 },
  statBoxV: { fontSize:16, fontFamily:"Inter_700Bold" },
  statBoxL: { fontSize:10, fontFamily:"Inter_400Regular", marginTop:2 },
  achieveGrid: { flexDirection:"row", flexWrap:"wrap", gap:8 },
  achieveItem: { width:"30%", borderRadius:10, borderWidth:1, padding:10, alignItems:"center", gap:5 },
  achieveLabel: { fontSize:9, fontFamily:"Inter_600SemiBold", textAlign:"center" },
  deviceRow: { flexDirection:"row", alignItems:"center", paddingVertical:12, gap:10 },
  deviceIcon: { width:38, height:38, borderRadius:10, alignItems:"center", justifyContent:"center" },
  deviceNameRow: { flexDirection:"row", alignItems:"center", gap:8, marginBottom:2 },
  deviceName: { fontSize:13, fontFamily:"Inter_600SemiBold" },
  currentBadge: { paddingHorizontal:6, paddingVertical:2, borderRadius:5 },
  currentBadgeTxt: { fontSize:9, fontFamily:"Inter_700Bold" },
  deviceLoc: { fontSize:11, fontFamily:"Inter_400Regular" },
  revokeBtn: { fontSize:12, fontFamily:"Inter_600SemiBold" },
  section: { marginHorizontal:8, marginBottom:6, borderRadius:14, borderWidth:1, overflow:"hidden" },
  sectionTitle: { fontSize:10, fontFamily:"Inter_700Bold", paddingHorizontal:16, paddingTop:12, paddingBottom:6, textTransform:"uppercase", letterSpacing:0.8 },
  settingRow: { flexDirection:"row", alignItems:"center", paddingHorizontal:14, paddingVertical:13, gap:10 },
  settingIcon: { width:34, height:34, borderRadius:10, alignItems:"center", justifyContent:"center" },
  settingLabel: { flex:1, fontSize:13.5, fontFamily:"Inter_500Medium" },
  settingRight: { flexDirection:"row", alignItems:"center", gap:6 },
  settingValue: { fontSize:11.5, fontFamily:"Inter_400Regular" },
  badge: { paddingHorizontal:8, paddingVertical:3, borderRadius:6 },
  badgeText: { fontSize:10, fontFamily:"Inter_700Bold" },
  actionBadge: { borderWidth:1, borderRadius:6, paddingHorizontal:8, paddingVertical:3 },
  actionBadgeTxt: { fontSize:10, fontFamily:"Inter_600SemiBold" },
  logoutBtn: { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:8, marginHorizontal:8, marginBottom:8, borderRadius:14, borderWidth:1, paddingVertical:16 },
  logoutText: { fontSize:14, fontFamily:"Inter_700Bold" },
  versionText: { fontSize:11, fontFamily:"Inter_400Regular", textAlign:"center", marginBottom:8 },
  modalOverlay: { flex:1, justifyContent:"flex-end", backgroundColor:"#00000088" },
  modalSheet: { borderTopLeftRadius:20, borderTopRightRadius:20, borderWidth:1, padding:16, paddingBottom:36 },
  handle: { width:40, height:4, borderRadius:2, alignSelf:"center", marginBottom:14 },
  modalTitle: { fontSize:16, fontFamily:"Inter_700Bold", marginBottom:14 },
  twoFaStatus: { flexDirection:"row", alignItems:"center", gap:10, borderRadius:10, borderWidth:1, padding:12, marginBottom:12 },
  twoFaStatusTxt: { fontSize:13, fontFamily:"Inter_600SemiBold" },
  twoFaMethod: { flexDirection:"row", alignItems:"center", gap:10, paddingVertical:13 },
  twoFaMethodTxt: { flex:1, fontSize:13, fontFamily:"Inter_500Medium" },
  enabledBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:5 },
  enabledBadgeTxt: { fontSize:10, fontFamily:"Inter_600SemiBold" },
  apiKey: { flexDirection:"row", alignItems:"center", paddingVertical:12 },
  apiKeyName: { fontSize:13, fontFamily:"Inter_600SemiBold" },
  apiKeyMeta: { fontSize:10, fontFamily:"Inter_400Regular", marginTop:2 },
  apiKeyDate: { fontSize:9.5, fontFamily:"Inter_400Regular" },
  createApiBtn: { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:6, borderWidth:1, borderRadius:10, paddingVertical:12, marginTop:8, marginBottom:8 },
  createApiTxt: { fontSize:13, fontFamily:"Inter_600SemiBold" },
  closeModalBtn: { borderRadius:12, paddingVertical:14, alignItems:"center" },
  closeModalTxt: { fontSize:14, fontFamily:"Inter_600SemiBold" },
});
