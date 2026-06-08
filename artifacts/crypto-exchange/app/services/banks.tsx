import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Alert } from 'react-native';
import { Header } from '@/components/Header';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Feather } from '@expo/vector-icons';

export default function Banks() {
  const colors = useColors();
  const { banks, addBank } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [acc, setAcc] = useState('');
  const [holder, setHolder] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');

  const handleAdd = () => {
    if (!acc || !holder || !ifsc || !bankName) { Alert.alert('Error', 'Fill all fields'); return; }
    addBank({
      id: 'B' + Date.now(), accountHolder: holder, accountNumber: acc, ifsc, bankName,
      status: 'under_review', addedAt: Date.now(),
    });
    Alert.alert('Submitted', 'Bank account submitted for verification');
    setShowForm(false); setAcc(''); setHolder(''); setIfsc(''); setBankName('');
  };

  const statusColor = (s: string) => s === 'verified' ? colors.success : s === 'under_review' ? colors.warning : colors.danger;
  const c = styles(colors);

  return (
    <SafeAreaView style={c.container}>
      <Header title="Bank Accounts" rightIcon={showForm ? 'x' : 'plus'} onRightPress={() => setShowForm(!showForm)} />
      <ScrollView contentContainerStyle={c.content}>
        {showForm && (
          <View style={c.form}>
            <Text style={c.formTitle}>Add Bank Account</Text>
            <TextInput style={c.fieldInput} placeholder="Account Holder Name" placeholderTextColor={colors.mutedForeground} value={holder} onChangeText={setHolder} />
            <TextInput style={c.fieldInput} placeholder="Account Number" placeholderTextColor={colors.mutedForeground} value={acc} onChangeText={setAcc} keyboardType="number-pad" />
            <TextInput style={c.fieldInput} placeholder="IFSC Code" placeholderTextColor={colors.mutedForeground} value={ifsc} onChangeText={t => setIfsc(t.toUpperCase())} autoCapitalize="characters" />
            <TextInput style={c.fieldInput} placeholder="Bank Name" placeholderTextColor={colors.mutedForeground} value={bankName} onChangeText={setBankName} />
            <TouchableOpacity style={[c.cta, { backgroundColor: colors.primary }]} onPress={handleAdd}>
              <Text style={[c.ctaText, { color: '#000' }]}>Submit for Verification</Text>
            </TouchableOpacity>
          </View>
        )}

        {banks.length === 0 ? (
          <View style={c.empty}>
            <Feather name="credit-card" size={50} color={colors.mutedForeground} />
            <Text style={c.emptyText}>No bank accounts added</Text>
          </View>
        ) : banks.map(b => (
          <View key={b.id} style={c.bankCard}>
            <View style={c.bankTop}>
              <View style={[c.bankIcon, { backgroundColor: colors.primary + '22' }]}>
                <Feather name="credit-card" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={c.bankName}>{b.bankName}</Text>
                <Text style={c.bankHolder}>{b.accountHolder}</Text>
              </View>
              <View style={[c.statusBadge, { backgroundColor: statusColor(b.status) + '22' }]}>
                <Text style={[c.statusText, { color: statusColor(b.status) }]}>
                  {b.status === 'under_review' ? 'Under Review' : b.status === 'verified' ? '✓ Verified' : 'Rejected'}
                </Text>
              </View>
            </View>
            <View style={c.bankDetails}>
              <View style={c.bankDetail}>
                <Text style={c.detailLbl}>Account</Text>
                <Text style={c.detailVal}>••••{b.accountNumber.slice(-4)}</Text>
              </View>
              <View style={c.bankDetail}>
                <Text style={c.detailLbl}>IFSC</Text>
                <Text style={c.detailVal}>{b.ifsc}</Text>
              </View>
              <View style={c.bankDetail}>
                <Text style={c.detailLbl}>Added</Text>
                <Text style={c.detailVal}>{new Date(b.addedAt).toLocaleDateString('en-IN')}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (col: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: col.background },
  content: { padding: 16, paddingBottom: 60 },
  form: { backgroundColor: col.card, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: col.primary, gap: 10 },
  formTitle: { fontSize: 14, color: col.foreground, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  fieldInput: { backgroundColor: col.secondary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 13, color: col.foreground, fontFamily: 'Inter_500Medium', borderWidth: 1, borderColor: col.border },
  cta: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  ctaText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 13, color: col.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 12 },
  bankCard: { backgroundColor: col.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: col.border },
  bankTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  bankIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bankName: { fontSize: 14, color: col.foreground, fontFamily: 'Inter_700Bold' },
  bankHolder: { fontSize: 11, color: col.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  bankDetails: { flexDirection: 'row', backgroundColor: col.secondary, borderRadius: 10, padding: 10 },
  bankDetail: { flex: 1, alignItems: 'center' },
  detailLbl: { fontSize: 10, color: col.mutedForeground, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' },
  detailVal: { fontSize: 12, color: col.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
});
