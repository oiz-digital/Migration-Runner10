import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Alert, Platform } from 'react-native';
import { Header } from '@/components/Header';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { OtpModal } from '@/components/OtpModal';

export default function WithdrawInr() {
  const colors = useColors();
  const router = useRouter();
  const { apiBanks, apiWallets, refreshWallets, refreshBanks, withdrawInrApi, user, kycLevels } = useApp();

  useEffect(() => { if (user.isLoggedIn) { refreshWallets(); refreshBanks(); } }, [user.isLoggedIn]);

  const kycLimit = kycLevels[user.kycLevel];
  const verifiedBanks = apiBanks.filter(b => b.status === 'verified');
  const [bankId, setBankId] = useState<number | null>(verifiedBanks[0]?.id ?? null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [otpOpen, setOtpOpen] = useState(false);

  useEffect(() => {
    if (!bankId && verifiedBanks[0]) setBankId(verifiedBanks[0].id);
  }, [verifiedBanks.length]);

  const inrWallet = apiWallets.find(w => w.coinSymbol === 'INR' && w.walletType === 'inr');
  const inrBal = inrWallet ? Number(inrWallet.balance) : 0;

  const amt = parseFloat(amount || '0');
  const fee = amt > 0 ? Math.max(10, +(amt * 0.001).toFixed(2)) : 0;
  const receive = Math.max(0, amt - fee);

  const showError = (m: string) => {
    setErrorMsg(m);
    if (Platform.OS !== 'web') Alert.alert('Error', m);
  };

  const handleWithdraw = () => {
    setErrorMsg('');
    if (!amt || amt < 100) { showError('Minimum withdraw ₹100'); return; }
    if (amt > inrBal) { showError('Insufficient balance'); return; }
    if (!bankId) { showError('Add a verified bank first'); return; }
    if (!user.phone && !user.email) { showError('Phone or email required for OTP'); return; }
    setOtpOpen(true);
  };

  const submitWithdraw = async (otpId: number) => {
    setOtpOpen(false);
    setLoading(true);
    try {
      const res: any = await withdrawInrApi(bankId!, amt, otpId);
      if (Platform.OS !== 'web') {
        Alert.alert('Withdrawal Requested', `Ref ${res?.refId}. ₹${receive.toLocaleString('en-IN')} will be credited within 30 mins.`);
      } else {
        setErrorMsg('');
      }
      setAmount('');
      router.back();
    } catch (e: any) {
      showError(e?.message || 'Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

  const otpRecipient = user.phone || user.email || '';
  const otpChannel: 'sms' | 'email' = user.phone ? 'sms' : 'email';

  const s = styles(colors);
  return (
    <SafeAreaView style={s.container}>
      <Header title="Withdraw INR" subtitle="Transfer to your bank" />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.balCard}>
          <Text style={s.balLabel}>Available Balance</Text>
          <Text style={s.balValue}>₹{inrBal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
          <View style={s.limitRow}>
            <Text style={s.limitText}>Daily limit: ₹{kycLimit.withdrawLimitDaily.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Bank Account</Text>
        {verifiedBanks.length === 0 ? (
          <TouchableOpacity style={s.addBank} onPress={() => router.push({ pathname: '/(tabs)/account', params: { tab: 'bank' } } as any)}>
            <Feather name="plus-circle" size={20} color={colors.primary} />
            <Text style={[s.addBankText, { color: colors.primary }]}>Add Bank Account</Text>
          </TouchableOpacity>
        ) : verifiedBanks.map(b => (
          <TouchableOpacity key={b.id} style={[s.bankItem, bankId === b.id && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]} onPress={() => setBankId(b.id)}>
            <View style={[s.bankIconBox, { backgroundColor: colors.primary + '22' }]}>
              <Feather name="credit-card" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.bankName}>{b.bankName}</Text>
              <Text style={s.bankAcc}>••••{b.accountNumber.slice(-4)} • {b.ifsc}</Text>
            </View>
            {bankId === b.id && <Feather name="check-circle" size={18} color={colors.primary} />}
          </TouchableOpacity>
        ))}

        <Text style={s.sectionTitle}>Amount</Text>
        <View style={s.inputBox}>
          <Text style={s.currency}>₹</Text>
          <TextInput style={s.input} placeholder="0.00" placeholderTextColor={colors.mutedForeground} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <TouchableOpacity style={s.maxWrap} onPress={() => setAmount(String(inrBal))}>
            <Text style={[s.maxBtn, { color: colors.primary }]}>MAX</Text>
          </TouchableOpacity>
        </View>

        <View style={s.quickRow}>
          {[25, 50, 75, 100].map(p => (
            <TouchableOpacity key={p} style={s.quickBtn} onPress={() => setAmount(String((inrBal * p / 100).toFixed(0)))}>
              <Text style={s.quickText}>{p}%</Text>
            </TouchableOpacity>
          ))}
        </View>

        {amt > 0 && (
          <View style={s.summary}>
            <View style={s.sumRow}><Text style={s.sumLbl}>Withdraw Amount</Text><Text style={s.sumVal}>₹{amt.toLocaleString('en-IN')}</Text></View>
            <View style={s.sumRow}><Text style={s.sumLbl}>Processing Fee (0.1%, min ₹10)</Text><Text style={s.sumVal}>₹{fee.toFixed(2)}</Text></View>
            <View style={s.sumDivider} />
            <View style={s.sumRow}><Text style={[s.sumLbl, { fontFamily: 'Inter_700Bold' }]}>You'll Receive</Text><Text style={[s.sumVal, { color: colors.success, fontSize: 16 }]}>₹{receive.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text></View>
          </View>
        )}

        {errorMsg ? (
          <View style={{ backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginTop: 8 }}>
            <Text style={{ color: '#b91c1c', fontSize: 13 }}>{errorMsg}</Text>
          </View>
        ) : null}

        <View style={s.note}>
          <Feather name="info" size={14} color={colors.warning} />
          <Text style={s.noteText}>Processed within 30 mins via IMPS during banking hours. Funds locked from balance until processed.</Text>
        </View>

        <TouchableOpacity style={[s.cta, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]} disabled={loading} onPress={handleWithdraw}>
          <Text style={[s.ctaText, { color: '#000' }]}>{loading ? 'Processing...' : 'Confirm Withdrawal'}</Text>
        </TouchableOpacity>
      </ScrollView>
      <OtpModal
        visible={otpOpen}
        channel={otpChannel}
        purpose="withdraw"
        recipient={otpRecipient}
        onClose={() => setOtpOpen(false)}
        onVerified={(otpId) => { void submitWithdraw(otpId); }}
      />
    </SafeAreaView>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, paddingBottom: 60 },
  balCard: { backgroundColor: c.card, borderRadius: 14, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: c.border },
  balLabel: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' },
  balValue: { fontSize: 24, color: c.foreground, fontFamily: 'Inter_700Bold', marginTop: 4 },
  limitRow: { marginTop: 6 },
  limitText: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_400Regular' },
  sectionTitle: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_700Bold', marginBottom: 10, marginTop: 4, textTransform: 'uppercase' },
  addBank: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: c.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: c.primary, borderStyle: 'dashed', gap: 8, marginBottom: 18 },
  addBankText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  bankItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, gap: 12, marginBottom: 8 },
  bankIconBox: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bankName: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  bankAcc: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: c.border, marginTop: 8, marginBottom: 10 },
  currency: { fontSize: 22, color: c.mutedForeground, fontFamily: 'Inter_500Medium', marginRight: 8 },
  input: { flex: 1, fontSize: 20, color: c.foreground, fontFamily: 'Inter_700Bold', minWidth: 0 },
  maxWrap: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: c.primary + '22' },
  maxBtn: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  quickBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, backgroundColor: c.secondary, borderRadius: 8, borderWidth: 1, borderColor: c.border },
  quickText: { fontSize: 12, color: c.foreground, fontFamily: 'Inter_500Medium' },
  summary: { backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: c.border, gap: 8 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sumLbl: { fontSize: 12, color: c.mutedForeground, fontFamily: 'Inter_400Regular' },
  sumVal: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  sumDivider: { height: 1, backgroundColor: c.border, marginVertical: 4 },
  note: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 8, backgroundColor: c.warning + '15', marginBottom: 16, marginTop: 12, alignItems: 'flex-start' },
  noteText: { flex: 1, fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  cta: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  ctaText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
});
