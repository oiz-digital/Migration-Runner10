import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { Header } from '@/components/Header';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Feather } from '@expo/vector-icons';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'deposit', label: 'Deposit' },
  { id: 'withdraw', label: 'Withdraw' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'earn', label: 'Earn' },
];

export default function WalletHistory() {
  const colors = useColors();
  const { transactions } = useApp();
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? transactions : transactions.filter(t => t.type === filter);

  const c = styles(colors);
  return (
    <SafeAreaView style={c.container}>
      <Header title="Transaction History" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={c.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.id} style={[c.filterBtn, filter === f.id && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setFilter(f.id)}>
            <Text style={[c.filterText, filter === f.id && { color: '#000' }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={c.content}>
        {filtered.map(t => (
          <View key={t.id} style={c.txnCard}>
            <View style={c.txnHead}>
              <View style={[c.iconBox, { backgroundColor: (t.type === 'deposit' || t.type === 'earn' ? colors.success : t.type === 'withdraw' ? colors.danger : colors.info) + '22' }]}>
                <Feather name={t.type === 'deposit' ? 'arrow-down' : t.type === 'withdraw' ? 'arrow-up' : t.type === 'earn' ? 'gift' : 'repeat'} size={16} color={t.type === 'deposit' || t.type === 'earn' ? colors.success : t.type === 'withdraw' ? colors.danger : colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={c.txnType}>{t.type.charAt(0).toUpperCase() + t.type.slice(1)} {t.symbol}</Text>
                <Text style={c.txnDate}>{new Date(t.timestamp).toLocaleString('en-IN')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[c.txnAmt, { color: t.type === 'withdraw' ? colors.danger : colors.success }]}>{t.type === 'withdraw' ? '-' : '+'}{t.amount} {t.symbol}</Text>
                <View style={[c.statusPill, { backgroundColor: (t.status === 'completed' ? colors.success : t.status === 'pending' ? colors.warning : colors.danger) + '22' }]}>
                  <Text style={[c.statusText, { color: t.status === 'completed' ? colors.success : t.status === 'pending' ? colors.warning : colors.danger }]}>{t.status}</Text>
                </View>
              </View>
            </View>
            <View style={c.txnDetails}>
              {t.network && <View style={c.detailRow}><Text style={c.detailLbl}>Network</Text><Text style={c.detailVal}>{t.network}</Text></View>}
              {t.address && <View style={c.detailRow}><Text style={c.detailLbl}>{t.type === 'transfer' ? 'Direction' : 'Address'}</Text><Text style={c.detailVal} numberOfLines={1}>{t.address}</Text></View>}
              {t.txHash && <View style={c.detailRow}><Text style={c.detailLbl}>Tx Hash</Text><Text style={[c.detailVal, { color: colors.primary }]} numberOfLines={1}>{t.txHash}</Text></View>}
              {t.bankRef && <View style={c.detailRow}><Text style={c.detailLbl}>Reference</Text><Text style={c.detailVal}>{t.bankRef}</Text></View>}
              {t.fee > 0 && <View style={c.detailRow}><Text style={c.detailLbl}>Fee</Text><Text style={c.detailVal}>{t.fee} {t.symbol}</Text></View>}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (col: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: col.background },
  filters: { paddingHorizontal: 16, paddingVertical: 12, maxHeight: 50 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 7, borderWidth: 1, borderColor: col.border, marginRight: 8, backgroundColor: col.card },
  filterText: { fontSize: 12, color: col.foreground, fontFamily: 'Inter_500Medium' },
  content: { padding: 16, paddingBottom: 60 },
  txnCard: { backgroundColor: col.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: col.border },
  txnHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  txnType: { fontSize: 13, color: col.foreground, fontFamily: 'Inter_600SemiBold' },
  txnDate: { fontSize: 11, color: col.mutedForeground, marginTop: 2, fontFamily: 'Inter_400Regular' },
  txnAmt: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  statusPill: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3 },
  statusText: { fontSize: 9, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' },
  txnDetails: { backgroundColor: col.secondary, borderRadius: 8, padding: 10, gap: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLbl: { fontSize: 11, color: col.mutedForeground, fontFamily: 'Inter_400Regular' },
  detailVal: { fontSize: 11, color: col.foreground, fontFamily: 'Inter_500Medium', maxWidth: '60%' },
});
