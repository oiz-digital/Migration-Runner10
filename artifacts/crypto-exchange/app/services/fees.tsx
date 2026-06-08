import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { Header } from '@/components/Header';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LoginRequired } from '@/components/LoginRequired';
import { api } from '@/lib/api';

type FeeTier = { level: number; name: string; minVolume: number; spotMaker: number; spotTaker: number; futuresMaker: number; futuresTaker: number; withdrawDiscount: number };
type FeeMy = { volume30dUsdt: number; totalFeesUsdt: number; currentTier: FeeTier; nextTier: FeeTier | null; tiers: FeeTier[] };

export default function Fees() {
  const colors = useColors();
  const { user } = useApp();
  const [data, setData] = useState<FeeMy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = React.useCallback(() => {
    if (!user.isLoggedIn) return;
    setLoading(true); setError(null);
    api.get<FeeMy>('/fees/my').then(setData).catch(e => setError(e?.message || 'Failed to load fees')).finally(() => setLoading(false));
  }, [user.isLoggedIn]);
  useEffect(() => { load(); }, [load]);

  if (!user.isLoggedIn) return <LoginRequired feature="fee schedule" />;
  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.primary} />
    </SafeAreaView>
  );
  if (error || !data) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Feather name="alert-circle" size={32} color={colors.warning} />
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 12, textAlign: 'center' }}>{error || 'No data'}</Text>
      <View style={{ marginTop: 14, borderRadius: 8, overflow: 'hidden' }}>
        <Text onPress={load} style={{ backgroundColor: colors.primary, color: '#000', paddingHorizontal: 18, paddingVertical: 10, fontFamily: 'Inter_700Bold' }}>Retry</Text>
      </View>
    </SafeAreaView>
  );

  const { currentTier: currentFeeTier, nextTier, tiers: feeTiers, volume30dUsdt } = data;
  // INR ≈ USDT * 83 for display
  const monthlyVolumeInr = volume30dUsdt * 83;
  const progress = nextTier ? (volume30dUsdt / nextTier.minVolume) * 100 : 100;

  const s = styles(colors);
  return (
    <SafeAreaView style={s.container}>
      <Header title="Fee Schedule" subtitle="Volume-based VIP tiers" />
      <ScrollView contentContainerStyle={s.content}>
        {/* Current Tier */}
        <View style={s.heroCard}>
          <View style={s.heroTop}>
            <View style={[s.tierBadge, { backgroundColor: colors.primary }]}>
              <MaterialCommunityIcons name="crown" size={18} color="#000" />
              <Text style={[s.tierBadgeText, { color: '#000' }]}>{currentFeeTier.name}</Text>
            </View>
            <Text style={s.heroLvl}>Tier {currentFeeTier.level}</Text>
          </View>
          <Text style={s.heroVolLbl}>30-Day Trading Volume</Text>
          <Text style={s.heroVol}>${volume30dUsdt.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
          <Text style={[s.progressText, { marginTop: 0, marginBottom: 8 }]}>≈ ₹{monthlyVolumeInr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>

          {nextTier && (
            <>
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${Math.min(100, progress)}%`, backgroundColor: colors.primary }]} />
              </View>
              <Text style={s.progressText}>
                ${(nextTier.minVolume - volume30dUsdt).toLocaleString('en-US', { maximumFractionDigits: 0 })} more to {nextTier.name}
              </Text>
            </>
          )}
        </View>

        {/* Current Rates */}
        <View style={s.ratesCard}>
          <Text style={s.ratesTitle}>Your Current Rates</Text>
          <View style={s.ratesGrid}>
            <View style={s.rateBox}>
              <Text style={s.rateLbl}>Spot Maker</Text>
              <Text style={s.rateVal}>{currentFeeTier.spotMaker}%</Text>
            </View>
            <View style={s.rateBox}>
              <Text style={s.rateLbl}>Spot Taker</Text>
              <Text style={s.rateVal}>{currentFeeTier.spotTaker}%</Text>
            </View>
            <View style={s.rateBox}>
              <Text style={s.rateLbl}>Futures Maker</Text>
              <Text style={s.rateVal}>{currentFeeTier.futuresMaker}%</Text>
            </View>
            <View style={s.rateBox}>
              <Text style={s.rateLbl}>Futures Taker</Text>
              <Text style={s.rateVal}>{currentFeeTier.futuresTaker}%</Text>
            </View>
          </View>
          <View style={s.discountRow}>
            <Feather name="percent" size={14} color={colors.success} />
            <Text style={[s.discountText, { color: colors.success }]}>{currentFeeTier.withdrawDiscount}% off withdrawal fees</Text>
          </View>
        </View>

        {/* All Tiers Table */}
        <Text style={s.sectionTitle}>All VIP Tiers</Text>
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.thCell, { flex: 0.8 }]}>Tier</Text>
            <Text style={[s.thCell, { flex: 1.5 }]}>30D Volume</Text>
            <Text style={s.thCell}>Maker</Text>
            <Text style={s.thCell}>Taker</Text>
          </View>
          {feeTiers.map(t => {
            const isCurrent = t.level === currentFeeTier.level;
            return (
              <View key={t.level} style={[s.tableRow, isCurrent && { backgroundColor: colors.primary + '12' }]}>
                <View style={[{ flex: 0.8 }]}>
                  <Text style={[s.tdCell, isCurrent && { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>{t.name}</Text>
                </View>
                <Text style={[s.tdCell, { flex: 1.5 }]}>≥ ${t.minVolume >= 1000000 ? `${(t.minVolume/1000000).toFixed(0)}M` : t.minVolume >= 1000 ? `${(t.minVolume/1000).toFixed(0)}K` : t.minVolume.toLocaleString()}</Text>
                <Text style={[s.tdCell, { color: colors.success }]}>{t.spotMaker}%</Text>
                <Text style={[s.tdCell, { color: colors.success }]}>{t.spotTaker}%</Text>
              </View>
            );
          })}
        </View>

        {/* Info */}
        <View style={s.infoBox}>
          <Feather name="info" size={14} color={colors.info} />
          <Text style={s.infoText}>Fees are calculated based on your last 30-day trading volume. Tier upgrades happen automatically.</Text>
        </View>

        <View style={s.discountList}>
          <Text style={s.discountTitle}>Additional Discounts</Text>
          <View style={s.discountItem}>
            <MaterialCommunityIcons name="alpha-c-circle" size={16} color={colors.primary} />
            <Text style={s.discountLbl}>Pay fees with CXT</Text>
            <Text style={[s.discountVal, { color: colors.success }]}>-25%</Text>
          </View>
          <View style={s.discountItem}>
            <MaterialCommunityIcons name="account-multiple" size={16} color={colors.primary} />
            <Text style={s.discountLbl}>Referral kickback</Text>
            <Text style={[s.discountVal, { color: colors.success }]}>-10%</Text>
          </View>
          <View style={s.discountItem}>
            <MaterialCommunityIcons name="crown" size={16} color={colors.primary} />
            <Text style={s.discountLbl}>Subscription Plan</Text>
            <Text style={[s.discountVal, { color: colors.success }]}>-15%</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, paddingBottom: 60 },
  heroCard: { backgroundColor: c.card, borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: c.primary + '40' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  tierBadgeText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  heroLvl: { fontSize: 12, color: c.mutedForeground, fontFamily: 'Inter_500Medium' },
  heroVolLbl: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' },
  heroVol: { fontSize: 26, color: c.foreground, fontFamily: 'Inter_700Bold', marginTop: 4, marginBottom: 12 },
  progressBar: { height: 8, backgroundColor: c.secondary, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 6 },
  ratesCard: { backgroundColor: c.card, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: c.border },
  ratesTitle: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  ratesGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  rateBox: { width: '50%', padding: 8 },
  rateLbl: { fontSize: 10, color: c.mutedForeground, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' },
  rateVal: { fontSize: 18, color: c.foreground, fontFamily: 'Inter_700Bold', marginTop: 4 },
  discountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 8, backgroundColor: c.success + '15', marginTop: 6 },
  discountText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  sectionTitle: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_700Bold', marginBottom: 10, textTransform: 'uppercase' },
  table: { backgroundColor: c.card, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: c.secondary, paddingHorizontal: 12, paddingVertical: 10 },
  thCell: { flex: 1, fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.borderSubtle, alignItems: 'center' },
  tdCell: { flex: 1, fontSize: 12, color: c.foreground, fontFamily: 'Inter_500Medium' },
  infoBox: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 8, backgroundColor: c.info + '15', marginBottom: 16, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 11, color: c.foreground, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  discountList: { backgroundColor: c.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border },
  discountTitle: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  discountItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  discountLbl: { flex: 1, fontSize: 12, color: c.foreground, fontFamily: 'Inter_500Medium' },
  discountVal: { fontSize: 13, fontFamily: 'Inter_700Bold' },
});
