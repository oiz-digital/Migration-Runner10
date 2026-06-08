import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Alert, Platform, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Header } from '@/components/Header';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Feather, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';

type Gateway = {
  id: number; code: string; name: string; type: string;
  minAmount: string; maxAmount: string; feeFlat: string; feePercent: string;
  processingTime: string; isAuto: boolean; config: string;
};

type Deposit = {
  id: number; refId: string; amount: string; fee: string; utr: string | null;
  status: string; createdAt: string; gatewayId: number;
};

const ICON: Record<string, any> = { upi: 'qrcode', imps: 'flash', neft: 'bank', rtgs: 'bank-transfer' };

export default function DepositInr() {
  const colors = useColors();
  const { fetchDepositGateways, submitInrDepositApi, fetchInrDeposits, apiWallets, user, kycLevels } = useApp();
  const kycLimit = kycLevels[user.kycLevel];

  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [history, setHistory] = useState<Deposit[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const [gs, hs] = await Promise.all([fetchDepositGateways(), fetchInrDeposits()]);
    setGateways(gs);
    setHistory(hs);
    if (gs.length && selectedId === null) setSelectedId(gs[0].id);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const selected = useMemo(() => gateways.find(g => g.id === selectedId) || gateways[0], [gateways, selectedId]);
  const cfg = useMemo(() => { try { return selected ? JSON.parse(selected.config) : {}; } catch { return {}; } }, [selected]);
  const amt = parseFloat(amount || '0');
  const fee = selected ? +(Number(selected.feeFlat) + (amt * Number(selected.feePercent) / 100)).toFixed(2) : 0;
  const inrWallet = apiWallets.find(w => w.coinSymbol === 'INR');
  const inrBalance = inrWallet ? Number(inrWallet.balance) : 0;

  const copy = async (val: string, label: string) => {
    try {
      if (Platform.OS === 'web' && navigator.clipboard) await navigator.clipboard.writeText(val);
      else await Clipboard.setStringAsync(val);
      Alert.alert('Copied', `${label} copied`);
    } catch { Alert.alert('Copy failed', val); }
  };

  const handleSubmit = async () => {
    if (!selected) return;
    if (!amt || amt < Number(selected.minAmount)) {
      Alert.alert('Error', `Minimum deposit ₹${Number(selected.minAmount).toLocaleString('en-IN')}`); return;
    }
    if (Number(selected.maxAmount) > 0 && amt > Number(selected.maxAmount)) {
      Alert.alert('Error', `Maximum deposit ₹${Number(selected.maxAmount).toLocaleString('en-IN')}`); return;
    }
    if (!selected.isAuto && (!utr || utr.trim().length < 6)) {
      Alert.alert('UTR Required', 'After paying, enter the UTR/Transaction Reference (min 6 characters) to claim your deposit.');
      return;
    }
    setSubmitting(true);
    try {
      const r: any = await submitInrDepositApi({ gatewayId: selected.id, amount: amt, utr: utr || undefined });
      Alert.alert('Deposit Submitted', `Ref: ${r.refId}\nStatus: Pending verification (${selected.processingTime})`);
      setAmount(''); setUtr('');
      await refresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not submit deposit');
    } finally { setSubmitting(false); }
  };

  const s = styles(colors);
  if (loading) return (
    <SafeAreaView style={s.container}>
      <Header title="Deposit INR" subtitle="Add funds to your INR wallet" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <Header title="Deposit INR" subtitle="Add funds to your INR wallet" />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.balCard}>
          <Text style={s.balLabel}>INR Wallet Balance</Text>
          <Text style={s.balValue}>₹{inrBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <View style={s.kycRow}>
            <Feather name="shield" size={12} color={colors.success} />
            <Text style={[s.kycText, { color: colors.success }]}>KYC L{user.kycLevel} • Limit ₹{kycLimit.depositLimit.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Select Payment Method</Text>
        {gateways.map(g => (
          <TouchableOpacity key={g.id} style={[s.methodCard, selectedId === g.id && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]} onPress={() => setSelectedId(g.id)}>
            <View style={[s.methodIcon, { backgroundColor: selectedId === g.id ? colors.primary : colors.secondary }]}>
              <MaterialCommunityIcons name={ICON[g.type] || 'bank'} size={22} color={selectedId === g.id ? '#000' : colors.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.methodTop}>
                <Text style={s.methodName}>{g.name}</Text>
                <Text style={s.methodTime}>{g.processingTime}</Text>
              </View>
              <Text style={s.methodDesc}>Fee ₹{g.feeFlat}{Number(g.feePercent) > 0 ? ` + ${g.feePercent}%` : ''} • ₹{Number(g.minAmount).toLocaleString('en-IN')} – ₹{Number(g.maxAmount).toLocaleString('en-IN')}</Text>
            </View>
            {selectedId === g.id && <Feather name="check-circle" size={20} color={colors.primary} />}
          </TouchableOpacity>
        ))}

        <Text style={s.sectionTitle}>Amount</Text>
        <View style={s.inputBox}>
          <Text style={s.currency}>₹</Text>
          <TextInput style={s.input} placeholder="0.00" placeholderTextColor={colors.mutedForeground} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        </View>

        <View style={s.quickRow}>
          {[1000, 5000, 10000, 50000].map(v => (
            <TouchableOpacity key={v} style={s.quickBtn} onPress={() => setAmount(String(v))}>
              <Text style={s.quickText}>₹{v >= 1000 ? `${v/1000}K` : v}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {selected?.type === 'upi' && cfg.upiId && (
          <View style={s.upiBox}>
            <Text style={s.upiTitle}>Pay via UPI</Text>
            <View style={s.upiQr}><FontAwesome5 name="qrcode" size={70} color={colors.foreground} /></View>
            <Text style={s.upiId}>{cfg.upiId}</Text>
            <TouchableOpacity onPress={() => copy(cfg.upiId, 'UPI ID')}><Text style={s.upiNote}>Tap to copy</Text></TouchableOpacity>
            {cfg.payeeName && <Text style={s.upiNote}>{cfg.payeeName}</Text>}
          </View>
        )}

        {selected && ['imps', 'neft', 'rtgs'].includes(selected.type) && cfg.accountNumber && (
          <View style={s.bankBox}>
            <Text style={s.bankTitle}>Bank Transfer Details</Text>
            <View style={s.bankRow}><Text style={s.bankKey}>Account Name</Text><Text style={s.bankVal}>{cfg.accountName}</Text></View>
            <TouchableOpacity onPress={() => copy(cfg.accountNumber, 'Account number')}>
              <View style={s.bankRow}><Text style={s.bankKey}>Account Number</Text><Text style={[s.bankVal, { color: colors.primary }]}>{cfg.accountNumber}</Text></View>
            </TouchableOpacity>
            <View style={s.bankRow}><Text style={s.bankKey}>IFSC</Text><Text style={s.bankVal}>{cfg.ifsc}</Text></View>
            <View style={s.bankRow}><Text style={s.bankKey}>Bank</Text><Text style={s.bankVal}>{cfg.bankName}</Text></View>
            <View style={s.bankRow}><Text style={s.bankKey}>Reference</Text><Text style={[s.bankVal, { color: colors.primary }]}>{user.uid}</Text></View>
          </View>
        )}

        {selected && !selected.isAuto && (
          <>
            <Text style={s.sectionTitle}>UTR / Transaction Reference</Text>
            <View style={s.inputBox}>
              <TextInput style={[s.input, { fontSize: 15 }]} placeholder="Enter UTR after payment" placeholderTextColor={colors.mutedForeground} value={utr} onChangeText={setUtr} autoCapitalize="characters" />
            </View>
            <Text style={s.helpText}>After completing the payment in your banking app, enter the UTR / transaction reference here to submit your deposit for verification.</Text>
          </>
        )}

        {amt > 0 && selected && (
          <View style={s.summary}>
            <View style={s.sumRow}><Text style={s.sumLbl}>Amount</Text><Text style={s.sumVal}>₹{amt.toLocaleString('en-IN')}</Text></View>
            <View style={s.sumRow}><Text style={s.sumLbl}>Fee</Text><Text style={s.sumVal}>₹{fee.toFixed(2)}</Text></View>
            <View style={s.sumDivider} />
            <View style={s.sumRow}><Text style={[s.sumLbl, { fontFamily: 'Inter_700Bold' }]}>You'll Receive</Text><Text style={[s.sumVal, { color: colors.success, fontSize: 16 }]}>₹{(amt - fee).toLocaleString('en-IN')}</Text></View>
          </View>
        )}

        <TouchableOpacity style={[s.cta, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]} onPress={handleSubmit} disabled={submitting}>
          <Text style={[s.ctaText, { color: '#000' }]}>{submitting ? 'Submitting...' : 'Submit Deposit'}</Text>
        </TouchableOpacity>

        {history.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { marginTop: 24 }]}>Recent Deposits</Text>
            {history.slice(0, 10).map(d => (
              <View key={d.id} style={s.histCard}>
                <View style={{ flex: 1 }}>
                  <Text style={s.histRef}>{d.refId}</Text>
                  <Text style={s.histDate}>{new Date(d.createdAt).toLocaleString('en-IN')}{d.utr ? ` • UTR ${d.utr}` : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.histAmt}>₹{Number(d.amount).toLocaleString('en-IN')}</Text>
                  <Text style={[s.histStatus, { color: d.status === 'completed' ? colors.success : d.status === 'rejected' ? colors.danger : colors.warning }]}>{d.status.toUpperCase()}</Text>
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
  balCard: { backgroundColor: c.card, borderRadius: 14, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: c.border },
  balLabel: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.5 },
  balValue: { fontSize: 24, color: c.foreground, fontFamily: 'Inter_700Bold', marginTop: 4 },
  kycRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  kycText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  sectionTitle: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_700Bold', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  methodCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border, gap: 12 },
  methodIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  methodTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  methodName: { fontSize: 14, color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  methodTime: { fontSize: 11, color: c.success, fontFamily: 'Inter_500Medium' },
  methodDesc: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: c.border, marginTop: 12, marginBottom: 10 },
  currency: { fontSize: 22, color: c.mutedForeground, fontFamily: 'Inter_500Medium', marginRight: 8 },
  input: { flex: 1, fontSize: 22, color: c.foreground, fontFamily: 'Inter_700Bold' },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  quickBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, backgroundColor: c.secondary, borderRadius: 8, borderWidth: 1, borderColor: c.border },
  quickText: { fontSize: 12, color: c.foreground, fontFamily: 'Inter_500Medium' },
  upiBox: { backgroundColor: c.card, borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 18, borderWidth: 1, borderColor: c.border },
  upiTitle: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_600SemiBold', marginBottom: 14 },
  upiQr: { width: 130, height: 130, backgroundColor: c.background, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1, borderColor: c.border },
  upiId: { fontSize: 16, color: c.primary, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  upiNote: { fontSize: 11, color: c.mutedForeground, marginTop: 6, fontFamily: 'Inter_400Regular' },
  bankBox: { backgroundColor: c.card, borderRadius: 14, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: c.border, gap: 10 },
  bankTitle: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  bankRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bankKey: { fontSize: 12, color: c.mutedForeground, fontFamily: 'Inter_400Regular' },
  bankVal: { fontSize: 12, color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  helpText: { fontSize: 11, color: c.mutedForeground, marginBottom: 12, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  summary: { backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: c.border, gap: 8 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sumLbl: { fontSize: 12, color: c.mutedForeground, fontFamily: 'Inter_400Regular' },
  sumVal: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  sumDivider: { height: 1, backgroundColor: c.border, marginVertical: 4 },
  cta: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  ctaText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  histCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: c.border },
  histRef: { fontSize: 12, color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  histDate: { fontSize: 10, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  histAmt: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_700Bold' },
  histStatus: { fontSize: 10, fontFamily: 'Inter_700Bold', marginTop: 2 },
});
