import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Share, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Header } from '@/components/Header';
import { useColors } from '@/hooks/useColors';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { api, type ApiReferStats } from '@/lib/api';

export default function Refer() {
  const colors = useColors();
  const [stats, setStats] = useState<ApiReferStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => { void load(); }, []);
  const load = async () => {
    setLoading(true);
    try { setStats(await api.get<ApiReferStats>('/refer/stats')); } catch {}
    finally { setLoading(false); }
  };

  const link = stats?.referralCode ? `https://cryptox.app/r/${stats.referralCode}` : '';
  const copy = async () => {
    if (!stats?.referralCode) return;
    await Clipboard.setStringAsync(stats.referralCode);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const share = async () => {
    if (!stats?.referralCode) return;
    try {
      await Share.share({ message: `Join CryptoX Exchange and start trading! Use my referral code ${stats.referralCode} or sign up via ${link}` });
    } catch {}
  };

  const s = styles(colors);
  return (
    <SafeAreaView style={s.container}>
      <Header title="Refer & Earn" subtitle="Invite friends, earn 30% commission for life" />
      <ScrollView contentContainerStyle={s.content}>
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : (
          <>
            <View style={s.hero}>
              <View style={s.heroIconWrap}>
                <MaterialCommunityIcons name="gift-outline" size={28} color={colors.primary} />
              </View>
              <Text style={s.heroTitle}>Earn together</Text>
              <Text style={s.heroSub}>30% trading fee commission + ₹100 KYC bonus per friend</Text>
            </View>

            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statVal}>{stats?.referredCount ?? 0}</Text>
                <Text style={s.statLbl}>Total Referred</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statVal}>{stats?.referredKycCount ?? 0}</Text>
                <Text style={s.statLbl}>KYC Completed</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statVal}>₹{(stats?.estimatedEarnings ?? 0).toLocaleString('en-IN')}</Text>
                <Text style={s.statLbl}>Earnings</Text>
              </View>
            </View>

            <Text style={s.sectionTitle}>Your referral code</Text>
            <View style={s.codeCard}>
              <Text style={s.code}>{stats?.referralCode ?? '—'}</Text>
              <TouchableOpacity onPress={copy} style={[s.copyBtn, { backgroundColor: copied ? colors.success + '20' : colors.primary + '20' }]}>
                <Feather name={copied ? 'check' : 'copy'} size={16} color={copied ? colors.success : colors.primary} />
                <Text style={[s.copyText, { color: copied ? colors.success : colors.primary }]}>{copied ? 'Copied' : 'Copy'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[s.shareBtn, { backgroundColor: colors.primary }]} onPress={share}>
              <Feather name="share-2" size={16} color="#000" />
              <Text style={s.shareText}>Share invite link</Text>
            </TouchableOpacity>

            <Text style={s.linkPreview} numberOfLines={1}>{link}</Text>

            <Text style={[s.sectionTitle, { marginTop: 24 }]}>Recent referrals</Text>
            {(stats?.recent?.length ?? 0) === 0 ? (
              <View style={s.emptyCard}>
                <Feather name="users" size={20} color={colors.mutedForeground} />
                <Text style={s.emptyText}>No referrals yet — share your code to get started</Text>
              </View>
            ) : stats!.recent.map(r => (
              <View key={r.id} style={s.refRow}>
                <View style={[s.avatar, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={[s.avatarText, { color: colors.primary }]}>{(r.name || 'U').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.refName}>{r.name || `User #${r.id}`}</Text>
                  <Text style={s.refSub}>Joined {new Date(r.createdAt).toLocaleDateString('en-IN')}</Text>
                </View>
                <View style={[s.kycPill, { backgroundColor: (r.kycLevel ?? 0) >= 1 ? colors.success + '20' : colors.warning + '20' }]}>
                  <Text style={[s.kycPillText, { color: (r.kycLevel ?? 0) >= 1 ? colors.success : colors.warning }]}>
                    {(r.kycLevel ?? 0) >= 1 ? `KYC L${r.kycLevel}` : 'No KYC'}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, paddingBottom: 60 },
  hero: { alignItems: 'center', backgroundColor: c.card, borderRadius: 16, padding: 22, marginBottom: 16, borderWidth: 1, borderColor: c.border },
  heroIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.primary + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  heroTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: c.foreground },
  heroSub: { fontSize: 12, color: c.mutedForeground, marginTop: 4, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  statCard: { flex: 1, backgroundColor: c.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  statVal: { fontSize: 16, fontFamily: 'Inter_700Bold', color: c.foreground },
  statLbl: { fontSize: 10, color: c.mutedForeground, marginTop: 4, textAlign: 'center' },
  sectionTitle: { fontSize: 12, color: c.foreground, fontFamily: 'Inter_700Bold', marginBottom: 10, textTransform: 'uppercase' },
  codeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
  code: { fontSize: 18, fontFamily: 'Inter_700Bold', color: c.foreground, letterSpacing: 1 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  copyText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 13 },
  shareText: { fontSize: 14, color: '#000', fontFamily: 'Inter_700Bold' },
  linkPreview: { fontSize: 11, color: c.mutedForeground, marginTop: 8, textAlign: 'center' },
  emptyCard: { alignItems: 'center', backgroundColor: c.card, borderRadius: 12, padding: 24, gap: 8, borderWidth: 1, borderColor: c.border },
  emptyText: { fontSize: 12, color: c.mutedForeground, textAlign: 'center' },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: c.border },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  refName: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  refSub: { fontSize: 11, color: c.mutedForeground, marginTop: 2 },
  kycPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  kycPillText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
});
