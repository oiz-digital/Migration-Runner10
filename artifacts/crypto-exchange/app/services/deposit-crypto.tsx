import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Alert, Platform, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Header } from '@/components/Header';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { CryptoIcon } from '@/components/CryptoIcon';
import { Feather, FontAwesome5 } from '@expo/vector-icons';

type Network = {
  id: number; coinId: number; chain: string; name: string;
  minDeposit: string; minWithdraw: string; withdrawFee: string;
  confirmations: number; memoRequired: boolean; status: string;
};

type CDeposit = {
  id: number; coinId: number; networkId: number; amount: string;
  txHash: string | null; confirmations: number; status: string; createdAt: string;
};

export default function DepositCrypto() {
  const colors = useColors();
  const { coins, apiCoins, fetchNetworks, fetchDepositAddress, notifyCryptoDepositApi, fetchCryptoDeposits } = useApp();

  const supportedCoins = useMemo(() => apiCoins.filter(c => c.symbol !== 'INR'), [apiCoins]);
  const [coinId, setCoinId] = useState<number | null>(null);
  const [showCoinList, setShowCoinList] = useState(false);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [networkId, setNetworkId] = useState<number | null>(null);
  const [address, setAddress] = useState<{ address: string; memo: string | null } | null>(null);
  const [loadingAddr, setLoadingAddr] = useState(false);
  const [history, setHistory] = useState<CDeposit[]>([]);
  const [showNotify, setShowNotify] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [notifyAmount, setNotifyAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!coinId && supportedCoins.length) setCoinId(supportedCoins[0].id); }, [supportedCoins]);

  useEffect(() => {
    if (!coinId) return;
    (async () => {
      const ns = await fetchNetworks(coinId) as any[];
      setNetworks(ns);
      setNetworkId(ns[0]?.id ?? null);
    })();
  }, [coinId]);

  useEffect(() => {
    if (!coinId || !networkId) return;
    setLoadingAddr(true); setAddress(null);
    fetchDepositAddress(coinId, networkId)
      .then((a: any) => setAddress({ address: a.address, memo: a.memo }))
      .catch(() => setAddress(null))
      .finally(() => setLoadingAddr(false));
  }, [coinId, networkId]);

  const refreshHistory = () => { fetchCryptoDeposits().then(setHistory); };
  useEffect(() => { refreshHistory(); }, []);

  const coin = supportedCoins.find(c => c.id === coinId);
  const network = networks.find(n => n.id === networkId);

  const copy = async (val: string, label: string) => {
    try {
      if (Platform.OS === 'web' && navigator.clipboard) await navigator.clipboard.writeText(val);
      else await Clipboard.setStringAsync(val);
      Alert.alert('Copied', `${label} copied to clipboard`);
    } catch { Alert.alert('Copy failed', val); }
  };

  const handleNotify = async () => {
    if (!coinId || !networkId) return;
    const amt = Number(notifyAmount);
    if (!Number.isFinite(amt) || amt <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }
    if (!txHash || txHash.trim().length < 10) { Alert.alert('Error', 'Enter a valid transaction hash'); return; }
    setSubmitting(true);
    try {
      await notifyCryptoDepositApi({ coinId, networkId, amount: amt, txHash: txHash.trim() });
      Alert.alert('Submitted', 'Your deposit will be credited after admin verification.');
      setTxHash(''); setNotifyAmount(''); setShowNotify(false);
      refreshHistory();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not submit deposit notification');
    } finally { setSubmitting(false); }
  };

  const s = styles(colors);
  return (
    <SafeAreaView style={s.container}>
      <Header title="Deposit Crypto" subtitle="Receive crypto to your wallet" />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.sectionTitle}>Select Coin</Text>
        <TouchableOpacity style={s.coinSelect} onPress={() => setShowCoinList(!showCoinList)}>
          {coin && <CryptoIcon symbol={coin.symbol} size={32} />}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.coinSym}>{coin?.symbol || '—'}</Text>
            <Text style={s.coinName}>{coin?.name || ''}</Text>
          </View>
          <Feather name={showCoinList ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
        </TouchableOpacity>

        {showCoinList && (
          <View style={s.coinList}>
            {supportedCoins.map(c => (
              <TouchableOpacity key={c.id} style={s.coinListItem} onPress={() => { setCoinId(c.id); setShowCoinList(false); }}>
                <CryptoIcon symbol={c.symbol} size={26} />
                <Text style={s.coinListText}>{c.symbol}</Text>
                <Text style={s.coinListName}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={s.sectionTitle}>Network</Text>
        {networks.length === 0 && <Text style={s.coinName}>No networks available</Text>}
        {networks.map(n => (
          <TouchableOpacity key={n.id} style={[s.netItem, networkId === n.id && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]} onPress={() => setNetworkId(n.id)}>
            <View style={{ flex: 1 }}>
              <Text style={s.netName}>{n.name}</Text>
              <Text style={s.netDesc}>Confirmations: {n.confirmations} • Min: {Number(n.minDeposit)} {coin?.symbol}{n.memoRequired ? ' • Memo required' : ''}</Text>
            </View>
            {networkId === n.id && <Feather name="check-circle" size={18} color={colors.primary} />}
          </TouchableOpacity>
        ))}

        <View style={s.qrCard}>
          <View style={s.qrBox}>
            <FontAwesome5 name="qrcode" size={120} color={colors.foreground} />
          </View>
          <Text style={s.qrLabel}>Deposit Address</Text>
          {loadingAddr ? (
            <ActivityIndicator color={colors.primary} />
          ) : address ? (
            <>
              <View style={s.addressBox}>
                <Text style={s.addressText} numberOfLines={1} ellipsizeMode="middle">{address.address}</Text>
              </View>
              <TouchableOpacity style={[s.copyBtn, { backgroundColor: colors.primary }]} onPress={() => copy(address.address, 'Address')}>
                <Feather name="copy" size={16} color="#000" />
                <Text style={[s.copyText, { color: '#000' }]}>Copy Address</Text>
              </TouchableOpacity>
              {address.memo && (
                <View style={{ marginTop: 12, width: '100%' }}>
                  <Text style={s.qrLabel}>Memo / Tag {network?.memoRequired ? '(required)' : ''}</Text>
                  <View style={s.addressBox}>
                    <Text style={s.addressText}>{address.memo}</Text>
                  </View>
                  <TouchableOpacity style={[s.copyBtn, { backgroundColor: colors.secondary, alignSelf: 'center' }]} onPress={() => copy(address.memo!, 'Memo')}>
                    <Feather name="copy" size={14} color={colors.foreground} />
                    <Text style={[s.copyText, { color: colors.foreground }]}>Copy Memo</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <Text style={s.coinName}>Address unavailable</Text>
          )}
        </View>

        {network && (
          <View style={s.infoGrid}>
            <View style={s.infoItem}><Text style={s.infoLbl}>Min Deposit</Text><Text style={s.infoVal}>{Number(network.minDeposit)} {coin?.symbol}</Text></View>
            <View style={s.infoItem}><Text style={s.infoLbl}>Confirmations</Text><Text style={s.infoVal}>{network.confirmations}</Text></View>
            <View style={s.infoItem}><Text style={s.infoLbl}>Network</Text><Text style={s.infoVal}>{network.chain}</Text></View>
          </View>
        )}

        <TouchableOpacity style={[s.notifyBtn, { borderColor: colors.primary }]} onPress={() => setShowNotify(!showNotify)}>
          <Feather name={showNotify ? 'chevron-up' : 'send'} size={16} color={colors.primary} />
          <Text style={[s.notifyText, { color: colors.primary }]}>{showNotify ? 'Hide' : 'I have sent — submit transaction hash'}</Text>
        </TouchableOpacity>

        {showNotify && (
          <View style={s.notifyForm}>
            <Text style={s.formLbl}>Amount sent</Text>
            <TextInput style={s.formInput} placeholder="0.00" placeholderTextColor={colors.mutedForeground} value={notifyAmount} onChangeText={setNotifyAmount} keyboardType="decimal-pad" />
            <Text style={s.formLbl}>Transaction Hash</Text>
            <TextInput style={s.formInput} placeholder="0x..." placeholderTextColor={colors.mutedForeground} value={txHash} onChangeText={setTxHash} autoCapitalize="none" />
            <TouchableOpacity style={[s.cta, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]} onPress={handleNotify} disabled={submitting}>
              <Text style={[s.ctaText, { color: '#000' }]}>{submitting ? 'Submitting...' : 'Submit for Verification'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={s.warn}>
          <Feather name="alert-triangle" size={14} color={colors.warning} />
          <Text style={s.warnText}>Send only {coin?.symbol} via {network?.name} to this address. Wrong network or asset will result in permanent loss{network?.memoRequired ? '. Memo/Tag is mandatory' : ''}.</Text>
        </View>

        {history.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { marginTop: 24 }]}>Recent Deposits</Text>
            {history.slice(0, 10).map(d => {
              const dCoin = supportedCoins.find(c => c.id === d.coinId);
              return (
                <View key={d.id} style={s.histCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.histRef}>{Number(d.amount)} {dCoin?.symbol || ''}</Text>
                    <Text style={s.histDate} numberOfLines={1} ellipsizeMode="middle">{d.txHash || 'no tx'}</Text>
                    <Text style={s.histDate}>{new Date(d.createdAt).toLocaleString('en-IN')}</Text>
                  </View>
                  <Text style={[s.histStatus, { color: d.status === 'completed' ? colors.success : d.status === 'rejected' ? colors.danger : colors.warning }]}>{d.status.toUpperCase()}</Text>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, paddingBottom: 60 },
  sectionTitle: { fontSize: 12, color: c.mutedForeground, fontFamily: 'Inter_700Bold', marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  coinSelect: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 14 },
  coinSym: { fontSize: 16, color: c.foreground, fontFamily: 'Inter_700Bold' },
  coinName: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  coinList: { backgroundColor: c.card, borderRadius: 12, padding: 4, marginBottom: 14, borderWidth: 1, borderColor: c.border, maxHeight: 280 },
  coinListItem: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 },
  coinListText: { fontSize: 14, color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  coinListName: { fontSize: 12, color: c.mutedForeground, fontFamily: 'Inter_400Regular' },
  netItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: c.border },
  netName: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  netDesc: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  qrCard: { backgroundColor: c.card, borderRadius: 14, padding: 20, alignItems: 'center', marginTop: 14, marginBottom: 14, borderWidth: 1, borderColor: c.border },
  qrBox: { width: 180, height: 180, backgroundColor: c.background, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 1, borderColor: c.border },
  qrLabel: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', marginBottom: 6 },
  addressBox: { backgroundColor: c.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, width: '100%', marginBottom: 12 },
  addressText: { fontSize: 12, color: c.foreground, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  copyText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  infoGrid: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 14 },
  infoItem: { flex: 1, alignItems: 'center' },
  infoLbl: { fontSize: 10, color: c.mutedForeground, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' },
  infoVal: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  notifyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  notifyText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  notifyForm: { backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: c.border },
  formLbl: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', marginBottom: 6, marginTop: 8 },
  formInput: { backgroundColor: c.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: c.foreground, fontFamily: 'Inter_500Medium', borderWidth: 1, borderColor: c.border },
  cta: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  ctaText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  warn: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 8, backgroundColor: c.warning + '15', alignItems: 'flex-start' },
  warnText: { flex: 1, fontSize: 11, color: c.foreground, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  histCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: c.border, gap: 12 },
  histRef: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_700Bold' },
  histDate: { fontSize: 10, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  histStatus: { fontSize: 10, fontFamily: 'Inter_700Bold' },
});
