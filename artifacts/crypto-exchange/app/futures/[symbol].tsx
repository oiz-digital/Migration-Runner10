import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Platform, TextInput, Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { CandleChart } from '@/components/CandleChart';
import { CryptoIcon } from '@/components/CryptoIcon';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { api, ApiError } from '@/lib/api';

type OrderType = 'market' | 'limit';
type ChartPeriod = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

type BookLevel = { price: number; qty: number; total: number };

export default function FuturesScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const colors = useColors();
  const { coins, positions, botEnabled, user, refreshWallets, apiPairs, apiCoins } = useApp();

  const pair = useMemo(() => {
    if (!symbol) return null;
    return apiPairs.find((p: any) => p.symbol === symbol && p.futuresEnabled) || apiPairs.find((p: any) => p.symbol === symbol) || null;
  }, [symbol, apiPairs]);

  const baseCoinApi = useMemo(() => pair ? apiCoins.find(c => c.id === pair.baseCoinId) || null : null, [pair, apiCoins]);
  const base = baseCoinApi?.symbol || symbol?.replace(/USDT$|INR$/, '') || 'BTC';
  const coin = coins.find(c => c.symbol === base);

  const usdtPrice = useMemo(() => Number(baseCoinApi?.currentPrice) || 0, [baseCoinApi]);
  const change24h = Number(baseCoinApi?.change24h ?? coin?.change24h ?? 0);

  const pairId = pair?.id ?? null;
  const [submitting, setSubmitting] = React.useState(false);

  const [side, setSide] = useState<'long' | 'short'>('long');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [leverage, setLeverage] = useState(10);
  const [qty, setQty] = useState('');
  const [period, setPeriod] = useState<ChartPeriod>('1h');
  const [tab, setTab] = useState<'orderbook' | 'positions' | 'holdings'>('orderbook');

  const [bids, setBids] = useState<BookLevel[]>([]);
  const [asks, setAsks] = useState<BookLevel[]>([]);

  React.useEffect(() => {
    if (!pairId) return;
    let alive = true;
    const fetchBook = async () => {
      try {
        const ob: any = await api.get(`/orderbook?pairId=${pairId}&depth=8`);
        if (!alive) return;
        setBids(ob.bids || []);
        setAsks(ob.asks || []);
      } catch {}
    };
    fetchBook();
    const t = setInterval(fetchBook, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [pairId]);

  const handleOpenPosition = async () => {
    if (submitting) return;
    if (!user.isLoggedIn) { router.push('/(auth)/login'); return; }
    if (!qty || parseFloat(qty) <= 0) { Alert.alert('Error', 'Enter valid quantity'); return; }
    if (!pairId) { Alert.alert('Error', 'Futures pair not available'); return; }
    setSubmitting(true);
    try {
      const pos = await api.post<any>('/positions/open', {
        pairId, side, leverage, qty: parseFloat(qty), marginType: 'isolated',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Position Opened',
        `${side.toUpperCase()} ${qty} ${base}/USDT\nEntry: $${Number(pos.entryPrice).toFixed(2)}\nLeverage: ${pos.leverage}x\nMargin: $${Number(pos.marginAmount).toFixed(2)}\nLiq Price: $${Number(pos.liquidationPrice).toFixed(2)}`
      );
      setQty('');
      refreshWallets().catch(() => {});
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Open Failed', e instanceof ApiError ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const s = styles(colors);
  const topPadding = Platform.OS === 'web' ? 80 : 0;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPadding || 12 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <CryptoIcon symbol={base} size={22} />
          <Text style={s.headerSymbol}>{base}/USDT Perp</Text>
          <View style={s.futuresBadge}><Text style={s.futuresBadgeText}>FUTURES</Text></View>
          {botEnabled && <View style={s.botBadge}><MaterialCommunityIcons name="robot" size={10} color="#000" /></View>}
        </View>
        <View style={s.headerPrice}>
          <Text style={[s.currentPrice, { color: change24h >= 0 ? colors.success : colors.danger }]}>
            ${usdtPrice.toFixed(2)}
          </Text>
          <Text style={[s.changeText, { color: change24h >= 0 ? colors.success : colors.danger }]}>
            {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Chart Period */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.periodRow}>
          {(['1m', '5m', '15m', '1h', '4h', '1d'] as ChartPeriod[]).map(p => (
            <TouchableOpacity key={p} style={[s.periodBtn, period === p && { backgroundColor: colors.primary + '22', borderColor: colors.primary }]} onPress={() => setPeriod(p)}>
              <Text style={[s.periodText, period === p && { color: colors.primary }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.chartContainer}>
          <CandleChart basePrice={usdtPrice} positive={change24h >= 0} height={180} />
        </View>

        {/* Tab */}
        <View style={s.tabRow}>
          {([{ key: 'orderbook', label: 'Order Book' }, { key: 'positions', label: 'Positions' }, { key: 'holdings', label: 'Holdings' }] as const).map(t => (
            <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && { borderBottomColor: colors.primary }]} onPress={() => setTab(t.key)}>
              <Text style={[s.tabText, tab === t.key && { color: colors.primary }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'orderbook' && (
          <View style={s.orderBook}>
            {asks.length === 0 && bids.length === 0 && (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Feather name="bar-chart-2" size={28} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 }}>No open orders yet</Text>
              </View>
            )}
            {asks.slice().reverse().slice(0, 6).map((a, i) => (
              <View key={`a${i}`} style={s.obRow}>
                <Text style={[s.obPrice, { color: colors.danger }]}>${a.price.toFixed(2)}</Text>
                <Text style={s.obQty}>{a.qty.toFixed(4)}</Text>
                <Text style={s.obTotal}>${a.total >= 1000 ? `${(a.total / 1000).toFixed(1)}K` : a.total.toFixed(0)}</Text>
              </View>
            ))}
            <View style={s.midPrice}>
              <Text style={[s.midPriceText, { color: change24h >= 0 ? colors.success : colors.danger }]}>${usdtPrice.toFixed(2)}</Text>
            </View>
            {bids.slice(0, 6).map((b, i) => (
              <View key={`b${i}`} style={s.obRow}>
                <Text style={[s.obPrice, { color: colors.success }]}>${b.price.toFixed(2)}</Text>
                <Text style={s.obQty}>{b.qty.toFixed(4)}</Text>
                <Text style={s.obTotal}>${b.total >= 1000 ? `${(b.total / 1000).toFixed(1)}K` : b.total.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'positions' && (
          <View style={s.posSection}>
            {positions.map(pos => (
              <View key={pos.symbol} style={s.posCard}>
                <View style={s.posHeader}>
                  <Text style={s.posSymbol}>{pos.symbol}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={[s.posBadge, { backgroundColor: pos.side === 'long' ? colors.success + '22' : colors.danger + '22' }]}>
                      <Text style={[s.posBadgeText, { color: pos.side === 'long' ? colors.success : colors.danger }]}>{pos.side.toUpperCase()}</Text>
                    </View>
                    <View style={s.levBadge}><Text style={s.levText}>{pos.leverage}x</Text></View>
                  </View>
                </View>
                <View style={s.posGrid}>
                  {[
                    { label: 'Entry', value: `$${pos.entryPrice}` },
                    { label: 'Mark', value: `$${pos.markPrice}` },
                    { label: 'Size', value: `${pos.size}` },
                    { label: 'Liq. Price', value: `$${pos.liquidationPrice}` },
                  ].map(({ label, value }) => (
                    <View key={label} style={s.posGridItem}>
                      <Text style={s.posLabel}>{label}</Text>
                      <Text style={s.posValue}>{value}</Text>
                    </View>
                  ))}
                </View>
                <View style={[s.pnlBox, { backgroundColor: pos.pnl >= 0 ? colors.success + '15' : colors.danger + '15' }]}>
                  <Text style={[s.pnlVal, { color: pos.pnl >= 0 ? colors.success : colors.danger }]}>
                    {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)} ({pos.pnl >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%)
                  </Text>
                  <Text style={s.pnlLabel}>Unrealized PnL</Text>
                </View>
                <TouchableOpacity style={[s.closeBtn, { borderColor: colors.danger }]} onPress={() => Alert.alert('Close', 'Position closed at market price')}>
                  <Text style={[s.closeBtnText, { color: colors.danger }]}>Close Position</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {tab === 'holdings' && (
          <View style={s.posSection}>
            <Text style={s.holdingsNote}>Investment & Average Cost</Text>
            {positions.map(pos => {
              const invested = pos.size * pos.entryPrice;
              const current = pos.size * pos.markPrice;
              const ret = ((current - invested) / invested) * 100;
              return (
                <View key={pos.symbol} style={s.holdCard}>
                  <View style={s.holdHeader}>
                    <CryptoIcon symbol={pos.symbol.replace('/USDT', '')} size={32} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.holdSymbol}>{pos.symbol}</Text>
                      <Text style={s.holdQty}>Holdings: {pos.size}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.holdReturn, { color: ret >= 0 ? colors.success : colors.danger }]}>
                        {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                      </Text>
                      <Text style={s.holdReturnLabel}>Return %</Text>
                    </View>
                  </View>
                  <View style={s.holdDetails}>
                    <View style={s.holdDetail}>
                      <Text style={s.holdDetailLabel}>Avg. Invest</Text>
                      <Text style={s.holdDetailValue}>${pos.entryPrice.toFixed(2)}</Text>
                    </View>
                    <View style={s.holdDetail}>
                      <Text style={s.holdDetailLabel}>Current</Text>
                      <Text style={s.holdDetailValue}>${pos.markPrice.toFixed(2)}</Text>
                    </View>
                    <View style={s.holdDetail}>
                      <Text style={s.holdDetailLabel}>Invested</Text>
                      <Text style={s.holdDetailValue}>${invested.toFixed(2)}</Text>
                    </View>
                    <View style={s.holdDetail}>
                      <Text style={s.holdDetailLabel}>P&L</Text>
                      <Text style={[s.holdDetailValue, { color: pos.pnl >= 0 ? colors.success : colors.danger }]}>${pos.pnl.toFixed(2)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Futures Trade Form */}
        <View style={s.tradeForm}>
          <View style={s.sideRow}>
            <TouchableOpacity style={[s.sideBtn, side === 'long' && { backgroundColor: colors.success }]} onPress={() => setSide('long')}>
              <Text style={[s.sideBtnText, side === 'long' && { color: '#fff' }]}>Long</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.sideBtn, side === 'short' && { backgroundColor: colors.danger }]} onPress={() => setSide('short')}>
              <Text style={[s.sideBtnText, side === 'short' && { color: '#fff' }]}>Short</Text>
            </TouchableOpacity>
          </View>

          {/* Leverage */}
          <View style={s.leverageRow}>
            <Text style={s.leverageLabel}>Leverage: {leverage}x</Text>
            <View style={s.leverageBtns}>
              {[1, 5, 10, 20, 50].map(l => (
                <TouchableOpacity key={l} style={[s.levBtn, leverage === l && { backgroundColor: colors.primary }]} onPress={() => setLeverage(l)}>
                  <Text style={[s.levBtnText, leverage === l && { color: '#000' }]}>{l}x</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>Quantity ({base})</Text>
            <View style={s.inputRow}>
              <TextInput style={s.tradeInput} value={qty} onChangeText={setQty} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
            </View>
          </View>

          {qty && (
            <View style={s.totalBox}>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Notional Value</Text>
                <Text style={s.totalValue}>${(parseFloat(qty || '0') * usdtPrice).toFixed(2)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Required Margin</Text>
                <Text style={s.totalValue}>${(parseFloat(qty || '0') * usdtPrice / leverage).toFixed(2)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Fee (0.04%)</Text>
                <Text style={s.totalValue}>${(parseFloat(qty || '0') * usdtPrice * 0.0004).toFixed(4)}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity style={[s.submitBtn, { backgroundColor: side === 'long' ? colors.success : colors.danger }]} onPress={handleOpenPosition}>
            <Text style={s.submitBtnText}>{side === 'long' ? 'Open Long' : 'Open Short'} {leverage}x</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' },
  headerSymbol: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.foreground },
  futuresBadge: { backgroundColor: colors.primary + '22', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  futuresBadgeText: { fontSize: 8, color: colors.primary, fontFamily: 'Inter_700Bold' },
  botBadge: { backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2 },
  headerPrice: { alignItems: 'flex-end' },
  currentPrice: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  changeText: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 1 },
  periodRow: { paddingHorizontal: 16, paddingVertical: 8 },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginRight: 6, backgroundColor: colors.secondary },
  periodText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
  chartContainer: { paddingHorizontal: 16, paddingBottom: 8 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
  orderBook: { paddingHorizontal: 16, paddingVertical: 8 },
  obRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  obPrice: { fontSize: 12, fontFamily: 'Inter_600SemiBold', flex: 1 },
  obQty: { fontSize: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', flex: 1, textAlign: 'center' },
  obTotal: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', flex: 1, textAlign: 'right' },
  midPrice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  midPriceText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  posSection: { padding: 16 },
  posCard: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  posHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  posSymbol: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
  posBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  posBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  levBadge: { backgroundColor: colors.primary + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  levText: { fontSize: 11, color: colors.primary, fontFamily: 'Inter_700Bold' },
  posGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  posGridItem: { width: '50%', marginBottom: 8 },
  posLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textTransform: 'uppercase' },
  posValue: { fontSize: 13, color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  pnlBox: { borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 10 },
  pnlVal: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  pnlLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  closeBtn: { borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1 },
  closeBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  holdingsNote: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginBottom: 12 },
  holdCard: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  holdHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  holdSymbol: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
  holdQty: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  holdReturn: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  holdReturnLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
  holdDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  holdDetail: {},
  holdDetailLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textTransform: 'uppercase' },
  holdDetailValue: { fontSize: 13, color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  tradeForm: { padding: 16 },
  sideRow: { flexDirection: 'row', backgroundColor: colors.secondary, borderRadius: 10, padding: 4, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  sideBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  sideBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.mutedForeground },
  leverageRow: { marginBottom: 12 },
  leverageLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.foreground, marginBottom: 8 },
  leverageBtns: { flexDirection: 'row', gap: 6 },
  levBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 6, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border },
  levBtnText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.secondary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderWidth: 1, borderColor: colors.border },
  tradeInput: { flex: 1, fontSize: 15, color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
  totalBox: { backgroundColor: colors.secondary, borderRadius: 8, padding: 12, marginBottom: 14, gap: 6, borderWidth: 1, borderColor: colors.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
  totalValue: { fontSize: 12, color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
  submitBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
});
