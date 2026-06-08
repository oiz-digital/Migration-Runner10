import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Alert, Platform, ActivityIndicator } from 'react-native';
import { Header } from '@/components/Header';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { CryptoIcon } from '@/components/CryptoIcon';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ApiNetwork } from '@/lib/api';
import { OtpModal } from '@/components/OtpModal';

export default function WithdrawCrypto() {
  const colors = useColors();
  const router = useRouter();
  const { apiCoins, apiWallets, refreshCoins, refreshWallets, fetchNetworks, withdrawCryptoApi, user } = useApp();

  useEffect(() => { if (user.isLoggedIn) { refreshCoins(); refreshWallets(); } }, [user.isLoggedIn]);

  const withdrawableCoins = apiCoins.filter(c => c.symbol !== 'INR' && c.status === 'active');
  const [coinId, setCoinId] = useState<number | null>(null);
  const [showCoinList, setShowCoinList] = useState(false);
  const [networks, setNetworks] = useState<ApiNetwork[]>([]);
  const [networkId, setNetworkId] = useState<number | null>(null);
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [otpOpen, setOtpOpen] = useState(false);

  useEffect(() => {
    if (!coinId && withdrawableCoins[0]) setCoinId(withdrawableCoins[0].id);
  }, [withdrawableCoins.length]);

  useEffect(() => {
    if (!coinId) return;
    let alive = true;
    (async () => {
      const nets = await fetchNetworks(coinId);
      if (!alive) return;
      const active = nets.filter(n => n.status === 'active');
      setNetworks(active);
      setNetworkId(active[0]?.id ?? null);
    })();
    return () => { alive = false; };
  }, [coinId]);

  const coin = apiCoins.find(c => c.id === coinId);
  const network = networks.find(n => n.id === networkId);
  const wallet = apiWallets.find(w => w.coinId === coinId && w.walletType === 'spot');
  const balance = wallet ? Number(wallet.balance) : 0;
  const requiresMemo = !!network?.memoRequired;

  const amt = parseFloat(amount || '0');
  const fee = network ? Number(network.withdrawFee) : 0;
  const tds = +(amt * 0.01).toFixed(8);
  const receive = Math.max(0, amt - fee - tds);

  const showError = (m: string) => {
    setErrorMsg(m);
    if (Platform.OS !== 'web') Alert.alert('Error', m);
  };

  const handleWithdraw = () => {
    setErrorMsg('');
    if (!coinId || !networkId || !network || !coin) { showError('Select coin and network'); return; }
    if (!amt || amt <= 0) { showError('Enter valid amount'); return; }
    if (amt < Number(network.minWithdraw)) { showError(`Minimum is ${network.minWithdraw} ${coin.symbol}`); return; }
    if (amt > balance) { showError('Insufficient balance'); return; }
    if (!address || address.trim().length < 20) { showError('Enter valid recipient address'); return; }
    if (requiresMemo && !memo.trim()) { showError('Memo / Destination tag required for this network'); return; }
    if (!user.phone && !user.email) { showError('Phone or email required for OTP'); return; }
    setOtpOpen(true);
  };

  const submitWithdraw = async (otpId: number) => {
    setOtpOpen(false);
    setLoading(true);
    try {
      const res: any = await withdrawCryptoApi({ coinId: coinId!, networkId: networkId!, amount: amt, toAddress: address.trim(), memo: requiresMemo ? memo.trim() || undefined : undefined, otpId });
      if (Platform.OS !== 'web' && coin) {
        Alert.alert('Withdrawal Submitted', `Ref ${res?.id}. ${receive.toFixed(6)} ${coin.symbol} will be sent after approval.`);
      }
      setAmount(''); setAddress(''); setMemo('');
      router.back();
    } catch (e: any) {
      showError(e?.message || 'Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

  const s = styles(colors);
  if (!apiCoins.length) {
    return <SafeAreaView style={s.container}><Header title="Withdraw Crypto" /><ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.container}>
      <Header title="Withdraw Crypto" subtitle="Send crypto to external wallet" />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.sectionTitle}>Select Coin</Text>
        <TouchableOpacity style={s.coinSelect} onPress={() => setShowCoinList(!showCoinList)}>
          {coin && <CryptoIcon symbol={coin.symbol} size={32} />}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.coinSym}>{coin?.symbol || '—'}</Text>
            <Text style={s.coinName}>Available: {balance.toFixed(6)} {coin?.symbol || ''}</Text>
          </View>
          <Feather name={showCoinList ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
        </TouchableOpacity>

        {showCoinList && (
          <View style={s.coinList}>
            {withdrawableCoins.map(c => (
              <TouchableOpacity key={c.id} style={s.coinListItem} onPress={() => { setCoinId(c.id); setShowCoinList(false); }}>
                <CryptoIcon symbol={c.symbol} size={26} />
                <Text style={s.coinListText}>{c.symbol}</Text>
                <Text style={s.coinListName}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={s.sectionTitle}>Network</Text>
        {networks.length === 0 ? (
          <View style={s.netItem}><Text style={s.netDesc}>No active networks for this coin</Text></View>
        ) : networks.map(n => (
          <TouchableOpacity key={n.id} style={[s.netItem, networkId === n.id && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]} onPress={() => setNetworkId(n.id)}>
            <View style={{ flex: 1 }}>
              <Text style={s.netName}>{n.name}</Text>
              <Text style={s.netDesc}>Network fee: {n.withdrawFee} {coin?.symbol} • Min: {n.minWithdraw}</Text>
            </View>
            {networkId === n.id && <Feather name="check-circle" size={18} color={colors.primary} />}
          </TouchableOpacity>
        ))}

        <Text style={s.sectionTitle}>Recipient Address</Text>
        <View style={s.inputBox}>
          <TextInput style={s.input} placeholder={`Enter ${coin?.symbol || ''} address`} placeholderTextColor={colors.mutedForeground} value={address} onChangeText={setAddress} multiline />
        </View>

        {requiresMemo && (
          <>
            <Text style={s.sectionTitle}>Memo / Destination Tag (Required)</Text>
            <View style={s.inputBox}>
              <TextInput style={s.input} placeholder="Destination tag" placeholderTextColor={colors.mutedForeground} value={memo} onChangeText={setMemo} />
            </View>
          </>
        )}

        <Text style={s.sectionTitle}>Amount</Text>
        <View style={s.inputBox}>
          <TextInput style={[s.input, { fontSize: 18, fontFamily: 'Inter_700Bold' }]} placeholder="0.00" placeholderTextColor={colors.mutedForeground} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <Text style={s.unit}>{coin?.symbol}</Text>
          <TouchableOpacity style={s.maxWrap} onPress={() => setAmount(String(balance))}>
            <Text style={[s.maxBtn, { color: colors.primary }]}>MAX</Text>
          </TouchableOpacity>
        </View>

        {amt > 0 && coin && (
          <View style={s.summary}>
            <View style={s.sumRow}><Text style={s.sumLbl}>Withdraw Amount</Text><Text style={s.sumVal}>{amt} {coin.symbol}</Text></View>
            <View style={s.sumRow}><Text style={s.sumLbl}>Network Fee</Text><Text style={s.sumVal}>{fee} {coin.symbol}</Text></View>
            <View style={s.sumRow}><Text style={[s.sumLbl, { color: colors.primary }]}>TDS (1%)</Text><Text style={[s.sumVal, { color: colors.primary }]}>{tds.toFixed(6)} {coin.symbol}</Text></View>
            <View style={s.sumDivider} />
            <View style={s.sumRow}><Text style={[s.sumLbl, { fontFamily: 'Inter_700Bold' }]}>You'll Receive</Text><Text style={[s.sumVal, { color: colors.success, fontSize: 15 }]}>{receive.toFixed(6)} {coin.symbol}</Text></View>
          </View>
        )}

        {errorMsg ? (
          <View style={{ backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginTop: 8 }}>
            <Text style={{ color: '#b91c1c', fontSize: 13 }}>{errorMsg}</Text>
          </View>
        ) : null}

        <View style={s.warn}>
          <Feather name="alert-triangle" size={14} color={colors.warning} />
          <Text style={s.warnText}>Double-check the address. Crypto sent to wrong address cannot be recovered. 1% TDS as per Indian regulations. Funds locked until approval.</Text>
        </View>

        <TouchableOpacity style={[s.cta, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]} disabled={loading} onPress={handleWithdraw}>
          <Text style={[s.ctaText, { color: '#000' }]}>{loading ? 'Processing...' : 'Confirm Withdrawal'}</Text>
        </TouchableOpacity>
      </ScrollView>
      <OtpModal
        visible={otpOpen}
        channel={user.phone ? 'sms' : 'email'}
        purpose="withdraw"
        recipient={user.phone || user.email || ''}
        onClose={() => setOtpOpen(false)}
        onVerified={(otpId) => { void submitWithdraw(otpId); }}
      />
    </SafeAreaView>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, paddingBottom: 60 },
  sectionTitle: { fontSize: 12, color: c.mutedForeground, fontFamily: 'Inter_700Bold', marginBottom: 8, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  coinSelect: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border },
  coinSym: { fontSize: 16, color: c.foreground, fontFamily: 'Inter_700Bold' },
  coinName: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  coinList: { backgroundColor: c.card, borderRadius: 12, padding: 4, marginTop: 6, borderWidth: 1, borderColor: c.border, maxHeight: 240 },
  coinListItem: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 },
  coinListText: { fontSize: 14, color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  coinListName: { fontSize: 12, color: c.mutedForeground },
  netItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: c.border },
  netName: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  netDesc: { fontSize: 11, color: c.mutedForeground, marginTop: 2 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: c.border, gap: 8 },
  input: { flex: 1, fontSize: 13, color: c.foreground, fontFamily: 'Inter_500Medium', minHeight: 24 },
  unit: { fontSize: 13, color: c.mutedForeground, fontFamily: 'Inter_600SemiBold' },
  maxWrap: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: c.primary + '22' },
  maxBtn: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  summary: { backgroundColor: c.card, borderRadius: 12, padding: 14, marginTop: 14, borderWidth: 1, borderColor: c.border, gap: 8 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sumLbl: { fontSize: 12, color: c.mutedForeground, fontFamily: 'Inter_400Regular' },
  sumVal: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  sumDivider: { height: 1, backgroundColor: c.border, marginVertical: 4 },
  warn: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 8, backgroundColor: c.warning + '15', marginTop: 14, marginBottom: 16, alignItems: 'flex-start' },
  warnText: { flex: 1, fontSize: 11, color: c.foreground, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  cta: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  ctaText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
});
