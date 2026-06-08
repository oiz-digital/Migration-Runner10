import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Alert, Switch, ActivityIndicator } from 'react-native';
import { Header } from '@/components/Header';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { CryptoIcon } from '@/components/CryptoIcon';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LoginRequired } from '@/components/LoginRequired';
import { api, ApiError } from '@/lib/api';

type ApiProduct = {
  id: number; coinId: number; name: string; description: string;
  type: 'simple' | 'advanced'; durationDays: number; apy: string;
  minAmount: string; maxAmount: string; status: string;
  earlyRedemption: boolean; earlyRedemptionPenaltyPct: string;
  minVipTier: number;
};

type ApiPosition = {
  id: number; productId: number; amount: string; totalEarned: string;
  autoMaturity: boolean; status: string; startedAt: string;
  maturedAt: string | null; closedAt: string | null;
  coinSymbol: string; productName: string; apy: string;
  durationDays: number; type: 'simple' | 'advanced';
};

export default function Earn() {
  const colors = useColors();
  const { user, refreshWallets, coins } = useApp();
  const [tab, setTab] = useState<'simple' | 'advanced' | 'positions'>('simple');
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [positions, setPositions] = useState<ApiPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<ApiProduct | null>(null);
  const [stakeAmount, setStakeAmount] = useState('');
  const [autoMaturity, setAutoMaturity] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const productSymbol = (p: ApiProduct) => coins.find(c => c.symbol && (c as any).id === p.coinId)?.symbol
    || coinSymbolFallback(p.coinId);

  const refresh = async () => {
    setLoading(true);
    try {
      const [pr, ps] = await Promise.all([
        api.get<ApiProduct[]>('/earn-products'),
        user.isLoggedIn ? api.get<ApiPosition[]>('/earn/positions') : Promise.resolve([] as ApiPosition[]),
      ]);
      setProducts(pr.filter(p => p.status === 'active'));
      setPositions(ps);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, [user.isLoggedIn]);

  if (!user.isLoggedIn) return <LoginRequired feature="Earn — staking & savings" />;

  const totalStaked = positions.reduce((s, p) => s + Number(p.amount), 0);
  const totalEarned = positions.reduce((s, p) => s + Number(p.totalEarned), 0);
  const filtered = products.filter(p => p.type === tab);

  const handleStake = async () => {
    if (!selectedProduct) return;
    const amt = parseFloat(stakeAmount);
    const min = Number(selectedProduct.minAmount);
    if (!amt || amt < min) { Alert.alert('Error', `Minimum stake: ${min}`); return; }
    setSubmitting(true);
    try {
      await api.post('/earn/subscribe', { productId: selectedProduct.id, amount: amt, autoMaturity });
      Alert.alert('Success', `Staked ${amt} at ${selectedProduct.apy}% APY`);
      setSelectedProduct(null); setStakeAmount('');
      await Promise.all([refresh(), refreshWallets()]);
    } catch (e) {
      Alert.alert('Stake Failed', e instanceof ApiError ? e.message : 'Network error');
    } finally { setSubmitting(false); }
  };

  const handleRedeem = async (pos: ApiPosition) => {
    const isMatured = pos.maturedAt ? Date.now() >= new Date(pos.maturedAt).getTime() : true;
    Alert.alert(isMatured ? 'Redeem' : 'Early Redeem',
      isMatured ? 'Funds will be moved to spot wallet' : 'Early redemption may incur a penalty. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: isMatured ? 'default' : 'destructive', onPress: async () => {
          try {
            const r: any = await api.post(`/earn/positions/${pos.id}/redeem`);
            Alert.alert('Redeemed', `Payout: ${Number(r.payout).toFixed(6)} ${pos.coinSymbol}\nEarned: ${Number(r.earned).toFixed(6)}${r.earlyPenalty > 0 ? `\nPenalty: -${Number(r.earlyPenalty).toFixed(6)}` : ''}`);
            await Promise.all([refresh(), refreshWallets()]);
          } catch (e) {
            Alert.alert('Redeem Failed', e instanceof ApiError ? e.message : 'Network error');
          }
        }},
      ]);
  };

  const s = styles(colors);
  return (
    <SafeAreaView style={s.container}>
      <Header title="Earn" subtitle="Grow your crypto holdings" />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.statsCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.statLbl}>Total Earnings</Text>
            <Text style={[s.statVal, { color: colors.success }]}>+{totalEarned.toFixed(4)}</Text>
            <Text style={s.statSub}>Lifetime rewards</Text>
          </View>
          <View style={s.statDivider} />
          <View style={{ flex: 1 }}>
            <Text style={s.statLbl}>Total Staked</Text>
            <Text style={s.statVal}>{totalStaked.toFixed(4)}</Text>
            <Text style={s.statSub}>{positions.filter(p => p.status === 'active').length} active</Text>
          </View>
        </View>

        <View style={s.tabs}>
          {([
            { key: 'simple', label: 'Flexible', icon: 'lock-open' as const },
            { key: 'advanced', label: 'Locked', icon: 'lock' as const },
            { key: 'positions', label: 'My Earn', icon: 'wallet' as const },
          ] as const).map(t => (
            <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && { backgroundColor: colors.primary }]} onPress={() => setTab(t.key)}>
              <Feather name={t.icon} size={13} color={tab === t.key ? '#000' : colors.mutedForeground} />
              <Text style={[s.tabText, { color: tab === t.key ? '#000' : colors.mutedForeground }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />}

        {(tab === 'simple' || tab === 'advanced') && !loading && (
          <>
            <View style={[s.infoBanner, tab === 'advanced' && { backgroundColor: colors.primary + '15' }]}>
              <MaterialCommunityIcons name={tab === 'simple' ? 'lock-open-outline' : 'trending-up'} size={20} color={tab === 'simple' ? colors.success : colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.bannerTitle}>{tab === 'simple' ? 'Flexible Savings' : 'Fixed Income (Locked)'}</Text>
                <Text style={s.bannerDesc}>{tab === 'simple' ? 'Unlock anytime • Daily interest' : 'Higher APY • Auto-maturity option'}</Text>
              </View>
            </View>
            {filtered.length === 0 ? (
              <View style={s.empty}><Text style={s.emptyText}>No products available</Text></View>
            ) : filtered.map(p => {
              const sym = productSymbol(p);
              return (
                <TouchableOpacity key={p.id} style={s.productCard} onPress={() => { setSelectedProduct(p); setAutoMaturity(false); setStakeAmount(''); }}>
                  <CryptoIcon symbol={sym} size={36} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.prodSym}>{sym} {p.name && `· ${p.name}`}</Text>
                    {p.type === 'advanced' && (
                      <View style={s.lockBadge}>
                        <Feather name="lock" size={10} color={colors.warning} />
                        <Text style={[s.lockText, { color: colors.warning }]}>{p.durationDays}D Lock</Text>
                      </View>
                    )}
                    <Text style={s.prodDesc}>Min: {Number(p.minAmount)} {sym}{p.minVipTier > 0 ? ` · VIP ${p.minVipTier}+` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.prodApy, { color: tab === 'simple' ? colors.success : colors.primary }]}>{Number(p.apy)}%</Text>
                    <Text style={s.prodApyLbl}>{tab === 'simple' ? 'Est. APY' : 'Fixed APY'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {tab === 'positions' && !loading && (
          positions.length === 0 ? (
            <View style={s.empty}>
              <MaterialCommunityIcons name="piggy-bank-outline" size={50} color={colors.mutedForeground} />
              <Text style={s.emptyText}>No active earnings yet</Text>
            </View>
          ) : positions.map(p => {
            const days = p.maturedAt ? Math.max(0, Math.ceil((new Date(p.maturedAt).getTime() - Date.now()) / 86400000)) : 0;
            const active = p.status === 'active' || p.status === 'matured';
            return (
              <View key={p.id} style={s.posCard}>
                <View style={s.posHeader}>
                  <CryptoIcon symbol={p.coinSymbol} size={32} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={s.posSym}>{p.coinSymbol} {p.type === 'simple' ? 'Flexible' : `${days}D Locked`}</Text>
                    <Text style={s.posDate}>Started {new Date(p.startedAt).toLocaleDateString('en-IN')}</Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: (active ? colors.success : colors.mutedForeground) + '22' }]}>
                    <Text style={[s.statusText, { color: active ? colors.success : colors.mutedForeground }]}>{p.status.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={s.posGrid}>
                  <View style={s.posItem}><Text style={s.posLbl}>Amount</Text><Text style={s.posValue}>{Number(p.amount)} {p.coinSymbol}</Text></View>
                  <View style={s.posItem}><Text style={s.posLbl}>APY</Text><Text style={[s.posValue, { color: colors.success }]}>{Number(p.apy)}%</Text></View>
                  <View style={s.posItem}><Text style={s.posLbl}>Earned</Text><Text style={[s.posValue, { color: colors.success }]}>+{Number(p.totalEarned).toFixed(6)}</Text></View>
                  <View style={s.posItem}><Text style={s.posLbl}>Auto Maturity</Text><Text style={s.posValue}>{p.autoMaturity ? 'On' : 'Off'}</Text></View>
                </View>
                {active && (
                  <TouchableOpacity style={[s.redeemBtn, { borderColor: p.type === 'simple' ? colors.success : colors.warning }]} onPress={() => handleRedeem(p)}>
                    <Text style={[s.redeemText, { color: p.type === 'simple' ? colors.success : colors.warning }]}>
                      {p.type === 'simple' || days === 0 ? 'Redeem' : 'Early Redeem'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        {selectedProduct && (
          <View style={s.stakeModal}>
            <View style={s.modalHeader}>
              <CryptoIcon symbol={productSymbol(selectedProduct)} size={32} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.modalTitle}>Stake {productSymbol(selectedProduct)}</Text>
                <Text style={s.modalSub}>{selectedProduct.type === 'simple' ? 'Flexible · Unlock anytime' : `${selectedProduct.durationDays}D Locked`}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedProduct(null)}>
                <Feather name="x" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <View style={s.apyBox}>
              <Text style={s.apyLbl}>APY</Text>
              <Text style={[s.apyValue, { color: colors.success }]}>{Number(selectedProduct.apy)}%</Text>
            </View>
            <View style={s.inputBox}>
              <TextInput style={s.input} placeholder="0.00" placeholderTextColor={colors.mutedForeground} value={stakeAmount} onChangeText={setStakeAmount} keyboardType="decimal-pad" />
              <Text style={s.unit}>{productSymbol(selectedProduct)}</Text>
            </View>
            <Text style={s.minNote}>Min: {Number(selectedProduct.minAmount)} {productSymbol(selectedProduct)}</Text>
            {selectedProduct.type === 'advanced' && (
              <View style={s.autoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.autoTitle}>Auto Maturity</Text>
                  <Text style={s.autoDesc}>Reinvest at end of lock</Text>
                </View>
                <Switch value={autoMaturity} onValueChange={setAutoMaturity} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />
              </View>
            )}
            <TouchableOpacity disabled={submitting} style={[s.cta, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]} onPress={handleStake}>
              {submitting ? <ActivityIndicator color="#000" /> : <Text style={[s.ctaText, { color: '#000' }]}>Confirm Stake</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function coinSymbolFallback(coinId: number): string {
  const map: Record<number, string> = { 1: 'INR', 2: 'USDT', 3: 'BTC', 4: 'ETH', 5: 'SOL', 6: 'BNB', 7: 'XRP' };
  return map[coinId] || 'USDT';
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, paddingBottom: 60 },
  statsCard: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: c.border },
  statLbl: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' },
  statVal: { fontSize: 22, color: c.foreground, fontFamily: 'Inter_700Bold', marginTop: 4 },
  statSub: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: c.border, marginHorizontal: 16 },
  tabs: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 10, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: c.border, gap: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 7 },
  tabText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  infoBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: c.success + '15', marginBottom: 14 },
  bannerTitle: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_700Bold' },
  bannerDesc: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  productCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border },
  prodSym: { fontSize: 14, color: c.foreground, fontFamily: 'Inter_700Bold' },
  prodDesc: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 3 },
  prodApy: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  prodApyLbl: { fontSize: 10, color: c.mutedForeground, fontFamily: 'Inter_400Regular' },
  lockBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, alignSelf: 'flex-start' },
  lockText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 13, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 12 },
  posCard: { backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border },
  posHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  posSym: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_700Bold' },
  posDate: { fontSize: 10, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  statusBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  statusText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  posGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  posItem: { width: '50%', marginBottom: 8 },
  posLbl: { fontSize: 10, color: c.mutedForeground, fontFamily: 'Inter_400Regular', textTransform: 'uppercase' },
  posValue: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  redeemBtn: { borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderWidth: 1 },
  redeemText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  stakeModal: { backgroundColor: c.card, borderRadius: 14, padding: 16, marginTop: 16, borderWidth: 1, borderColor: c.primary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 14, color: c.foreground, fontFamily: 'Inter_700Bold' },
  modalSub: { fontSize: 11, color: c.mutedForeground, marginTop: 2 },
  apyBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.secondary, borderRadius: 10, padding: 12, marginBottom: 12 },
  apyLbl: { fontSize: 12, color: c.mutedForeground, fontFamily: 'Inter_500Medium' },
  apyValue: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, gap: 8, borderWidth: 1, borderColor: c.border },
  input: { flex: 1, fontSize: 18, color: c.foreground, fontFamily: 'Inter_700Bold' },
  unit: { fontSize: 13, color: c.mutedForeground, fontFamily: 'Inter_600SemiBold' },
  minNote: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 6 },
  autoRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.secondary, borderRadius: 10, padding: 12, marginTop: 12 },
  autoTitle: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  autoDesc: { fontSize: 11, color: c.mutedForeground, marginTop: 2 },
  cta: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  ctaText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
