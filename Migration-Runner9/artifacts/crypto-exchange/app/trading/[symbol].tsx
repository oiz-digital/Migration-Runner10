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
import { Feather, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { api, ApiError } from '@/lib/api';

type OrderType = 'market' | 'limit' | 'stop';
type ChartPeriod = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
type BookLevel = { price: number; qty: number; total: number };
type RecentTrade = { id: number; price: number; qty: number; side: string; ts: number };

export default function TradingScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const colors = useColors();
  const { coins, walletBalances, botEnabled, orders, cancelOrder, user, refreshWallets, apiPairs, apiCoins, inrUsdtRate } = useApp();

  // Resolve pair from URL symbol (e.g. BTCINR, BTCUSDT)
  const pair = useMemo(() => {
    if (!symbol) return null;
    return apiPairs.find((p: any) => p.symbol === symbol) || null;
  }, [symbol, apiPairs]);

  const quoteCoin = useMemo(() => {
    if (!pair) return null;
    return apiCoins.find(c => c.id === pair.quoteCoinId) || null;
  }, [pair, apiCoins]);

  const baseCoinApi = useMemo(() => {
    if (!pair) return null;
    return apiCoins.find(c => c.id === pair.baseCoinId) || null;
  }, [pair, apiCoins]);

  const quoteSym = quoteCoin?.symbol || (symbol?.endsWith('USDT') ? 'USDT' : 'INR');
  const isInr = quoteSym === 'INR';
  const ccy = isInr ? '₹' : '$';
  const locale = isInr ? 'en-IN' : 'en-US';
  const fmt = (n: number, max = 2) => n.toLocaleString(locale, { maximumFractionDigits: max });

  const base = baseCoinApi?.symbol || symbol?.replace(/INR$|USDT$/, '') || 'BTC';
  const coinLegacy = coins.find(c => c.symbol === base);

  // Display price: INR pair uses priceInr, USDT pair uses currentPrice
  const displayPrice = useMemo(() => {
    if (!baseCoinApi) return coinLegacy?.price || 0;
    if (isInr) return Number(baseCoinApi.priceInr ?? coinLegacy?.price ?? 0);
    return Number(baseCoinApi.currentPrice ?? 0);
  }, [baseCoinApi, isInr, coinLegacy]);

  const change24h = Number(baseCoinApi?.change24h ?? coinLegacy?.change24h ?? 0);
  // Live pair-stats from DB (server recomputes every 30s from real trades)
  const high24h = pair ? Number((pair as any).high24h || 0) : (coinLegacy?.high24h || 0);
  const low24h = pair ? Number((pair as any).low24h || 0) : (coinLegacy?.low24h || 0);
  const vol24h = pair ? Number((pair as any).volume24h || 0) : (coinLegacy?.volume24h || 0);
  const quoteVol24h = pair ? Number((pair as any).quoteVolume24h || 0) : 0;

  const pairId = pair?.id ?? null;
  const [submitting, setSubmitting] = React.useState(false);

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<OrderType>('limit');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [period, setPeriod] = useState<ChartPeriod>('1h');
  const [tab, setTab] = useState<'orderbook' | 'trades' | 'orders'>('orderbook');
  const [percent, setPercent] = useState<number>(0);

  React.useEffect(() => {
    if (displayPrice > 0 && !price) setPrice(displayPrice.toFixed(quoteCoin?.symbol === 'INR' ? 2 : 4));
  }, [displayPrice, quoteCoin?.symbol]);

  const balance = walletBalances.find(b => b.symbol === (side === 'buy' ? quoteSym : base));
  const availableBalance = balance?.available || 0;

  // Live order book + recent trades from DB (polled)
  const [bids, setBids] = useState<BookLevel[]>([]);
  const [asks, setAsks] = useState<BookLevel[]>([]);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);

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
    const fetchTrades = async () => {
      try {
        const rt: any = await api.get(`/recent-trades?pairId=${pairId}&limit=20`);
        if (!alive) return;
        setRecentTrades(Array.isArray(rt) ? rt : []);
      } catch {}
    };
    fetchBook();
    fetchTrades();
    const t1 = setInterval(fetchBook, 3000);
    const t2 = setInterval(fetchTrades, 4000);
    return () => { alive = false; clearInterval(t1); clearInterval(t2); };
  }, [pairId]);

  const handleOrder = async () => {
    if (submitting) return;
    if (!user.isLoggedIn) { router.push('/(auth)/login'); return; }
    if (!qty || parseFloat(qty) <= 0) { Alert.alert('Error', 'Enter valid quantity'); return; }
    if (!pairId) { Alert.alert('Error', 'Pair not loaded yet, retry'); return; }
    setSubmitting(true);
    const qtyNum = parseFloat(qty);
    const orderPrice = orderType === 'market' ? displayPrice : parseFloat(price);
    try {
      const created = await api.post<any>('/orders', {
        pairId, side, type: orderType === 'stop' ? 'limit' : orderType,
        price: orderPrice, qty: qtyNum,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const total = Number(created.price) * Number(created.qty);
      Alert.alert(
        created.status === 'filled' ? 'Order Filled' : 'Order Placed',
        `${side.toUpperCase()} ${qtyNum} ${base}\nPrice: ${ccy}${fmt(Number(created.price))}\nTotal: ${ccy}${fmt(total)}\nFee: ${Number(created.fee || 0).toFixed(4)}\nStatus: ${created.status}`
      );
      setQty('');
      refreshWallets().catch(() => {});
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Order Failed', e instanceof ApiError ? e.message : 'Network error');
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
          <CryptoIcon symbol={base} size={24} />
          <Text style={s.headerSymbol}>{base}/{quoteSym}</Text>
          {botEnabled && (
            <View style={s.botBadge}>
              <MaterialCommunityIcons name="robot" size={10} color="#000" />
            </View>
          )}
        </View>
        <View style={s.headerPrice}>
          <Text style={[s.currentPrice, { color: change24h >= 0 ? colors.success : colors.danger }]}>
            {ccy}{fmt(displayPrice)}
          </Text>
          <Text style={[s.changeText, { color: change24h >= 0 ? colors.success : colors.danger }]}>
            {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Stats Bar */}
        <View style={s.statsBar}>
          {[
            { label: '24H High', value: high24h > 0 ? `${ccy}${fmt(high24h, high24h >= 1 ? 2 : 5)}` : '—' },
            { label: '24H Low',  value: low24h  > 0 ? `${ccy}${fmt(low24h,  low24h  >= 1 ? 2 : 5)}` : '—' },
            { label: `Vol(${base})`,  value: vol24h      > 0 ? (vol24h      >= 1e9 ? (vol24h/1e9).toFixed(2)+'B' : vol24h      >= 1e6 ? (vol24h/1e6).toFixed(2)+'M' : vol24h      >= 1e3 ? (vol24h/1e3).toFixed(2)+'K' : vol24h.toFixed(2)) : '—' },
            { label: `Vol(${quote})`, value: quoteVol24h > 0 ? (quoteVol24h >= 1e9 ? (quoteVol24h/1e9).toFixed(2)+'B' : quoteVol24h >= 1e6 ? (quoteVol24h/1e6).toFixed(2)+'M' : quoteVol24h >= 1e3 ? (quoteVol24h/1e3).toFixed(2)+'K' : quoteVol24h.toFixed(2)) : '—' },
          ].map(({ label, value }) => (
            <View key={label} style={s.statItem}>
              <Text style={s.statLabel}>{label}</Text>
              <Text style={s.statValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Chart Period */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.periodRow}>
          {(['1m', '5m', '15m', '1h', '4h', '1d'] as ChartPeriod[]).map(p => (
            <TouchableOpacity key={p} style={[s.periodBtn, period === p && { backgroundColor: colors.primary + '22', borderColor: colors.primary }]} onPress={() => setPeriod(p)}>
              <Text style={[s.periodText, period === p && { color: colors.primary }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Candle Chart */}
        <View style={s.chartContainer}>
          <CandleChart
            symbol={base}
            interval={period}
            livePrice={displayPrice}
            quoteSymbol={quoteSym as 'USDT' | 'INR'}
            inrRate={inrUsdtRate}
            height={280}
          />
        </View>

        {/* Order Book / Trades */}
        <View style={s.tabRow}>
          {([{ key: 'orderbook', label: 'Order Book' }, { key: 'trades', label: 'Recent Trades' }, { key: 'orders', label: 'My Orders' }] as const).map(t => (
            <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && { borderBottomColor: colors.primary }]} onPress={() => setTab(t.key)}>
              <Text style={[s.tabText, tab === t.key && { color: colors.primary }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'orderbook' && (
          <View style={s.orderBook}>
            <View style={s.obHeader}>
              <Text style={s.obLabel}>Price ({quoteSym})</Text>
              <Text style={s.obLabel}>Qty ({base})</Text>
              <Text style={s.obLabel}>Total ({quoteSym})</Text>
            </View>
            {asks.length === 0 && bids.length === 0 && (
              <>
                {[...Array(6)].map((_, i) => (
                  <View key={`pa${i}`} style={s.obRow}>
                    <View style={[s.obFill, { width: `${20 + i * 10}%`, backgroundColor: colors.danger + '11' }]} />
                    <Text style={[s.obPrice, { color: colors.danger, opacity: 0.35 }]}>— — —</Text>
                    <Text style={[s.obQty, { opacity: 0.35 }]}>— — —</Text>
                    <Text style={[s.obTotal, { opacity: 0.35 }]}>— — —</Text>
                  </View>
                ))}
                <View style={s.midPrice}>
                  <Text style={[s.midPriceText, { color: change24h >= 0 ? colors.success : colors.danger }]}>
                    {ccy}{fmt(displayPrice, isInr ? 2 : 4)}
                  </Text>
                  <MaterialIcons name={change24h >= 0 ? 'arrow-upward' : 'arrow-downward'} size={14} color={change24h >= 0 ? colors.success : colors.danger} />
                </View>
                {[...Array(6)].map((_, i) => (
                  <View key={`pb${i}`} style={s.obRow}>
                    <View style={[s.obFill, { width: `${80 - i * 10}%`, backgroundColor: colors.success + '11' }]} />
                    <Text style={[s.obPrice, { color: colors.success, opacity: 0.35 }]}>— — —</Text>
                    <Text style={[s.obQty, { opacity: 0.35 }]}>— — —</Text>
                    <Text style={[s.obTotal, { opacity: 0.35 }]}>— — —</Text>
                  </View>
                ))}
                <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 11 }}>Waiting for orders...</Text>
                </View>
              </>
            )}
            {asks.length > 0 && asks.slice().reverse().slice(0, 6).map((a, i) => {
              const maxQty = Math.max(...asks.map(x => x.qty), 0.0001);
              return (
                <View key={`a${i}`} style={s.obRow}>
                  <View style={[s.obFill, { width: `${Math.min(100, (a.qty / maxQty) * 100)}%`, backgroundColor: colors.danger + '22' }]} />
                  <Text style={[s.obPrice, { color: colors.danger }]}>{fmt(a.price, isInr ? 2 : 4)}</Text>
                  <Text style={s.obQty}>{a.qty.toFixed(4)}</Text>
                  <Text style={s.obTotal}>{a.total >= 1000 ? `${(a.total / 1000).toFixed(1)}K` : a.total.toFixed(2)}</Text>
                </View>
              );
            })}
            <View style={s.midPrice}>
              <Text style={[s.midPriceText, { color: change24h >= 0 ? colors.success : colors.danger }]}>
                {ccy}{fmt(displayPrice, isInr ? 2 : 4)}
              </Text>
              <MaterialIcons name={change24h >= 0 ? 'arrow-upward' : 'arrow-downward'} size={14} color={change24h >= 0 ? colors.success : colors.danger} />
            </View>
            {bids.slice(0, 6).map((b, i) => {
              const maxQty = Math.max(...bids.map(x => x.qty), 0.0001);
              return (
                <View key={`b${i}`} style={s.obRow}>
                  <View style={[s.obFill, { width: `${Math.min(100, (b.qty / maxQty) * 100)}%`, backgroundColor: colors.success + '22' }]} />
                  <Text style={[s.obPrice, { color: colors.success }]}>{fmt(b.price, isInr ? 2 : 4)}</Text>
                  <Text style={s.obQty}>{b.qty.toFixed(4)}</Text>
                  <Text style={s.obTotal}>{b.total >= 1000 ? `${(b.total / 1000).toFixed(1)}K` : b.total.toFixed(2)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {tab === 'orders' && (
          <View style={s.tradesSection}>
            {orders.filter(o => o.symbol === `${base}/${quoteSym}`).length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Feather name="inbox" size={28} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 }}>No orders for {base}/{quoteSym}</Text>
              </View>
            ) : (
              orders.filter(o => o.symbol === `${base}/${quoteSym}`).slice(0, 20).map(o => {
                const fillPct = Math.min(100, Math.round((o.filled / o.quantity) * 100));
                const statusColor = o.status === 'filled' ? colors.success : o.status === 'cancelled' ? colors.mutedForeground : o.status === 'partial' ? colors.warning : colors.primary;
                return (
                  <View key={o.id} style={s.myOrderCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: (o.side === 'buy' ? colors.success : colors.danger) + '22' }}>
                          <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: o.side === 'buy' ? colors.success : colors.danger, textTransform: 'uppercase' }}>{o.side} {o.type}</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>{new Date(o.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: statusColor + '22' }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: statusColor, textTransform: 'uppercase' }}>{o.status}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <View>
                        <Text style={s.myOrderLbl}>Price</Text>
                        <Text style={s.myOrderVal}>{ccy}{fmt(o.price, isInr ? 2 : 4)}</Text>
                      </View>
                      <View>
                        <Text style={s.myOrderLbl}>Qty</Text>
                        <Text style={s.myOrderVal}>{o.quantity.toFixed(4)} {base}</Text>
                      </View>
                      <View>
                        <Text style={s.myOrderLbl}>Total</Text>
                        <Text style={s.myOrderVal}>{ccy}{fmt(o.total)}</Text>
                      </View>
                    </View>
                    <View style={{ marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={s.myOrderLbl}>Filled</Text>
                        <Text style={[s.myOrderLbl, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{fillPct}% • {o.filled.toFixed(4)} {base}</Text>
                      </View>
                      <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${fillPct}%`, backgroundColor: o.status === 'filled' ? colors.success : colors.primary }} />
                      </View>
                    </View>
                    {(o.status === 'open' || o.status === 'partial') && (
                      <TouchableOpacity onPress={() => {
                        Alert.alert('Cancel Order?', `Cancel ${o.side} ${o.quantity} ${base} @ ${ccy}${fmt(o.price, isInr ? 2 : 4)}?`, [
                          { text: 'Keep', style: 'cancel' },
                          { text: 'Cancel Order', style: 'destructive', onPress: () => { cancelOrder(o.id); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } },
                        ]);
                      }} style={{ alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.danger }}>
                        <Text style={{ color: colors.danger, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {tab === 'trades' && (
          <View style={s.tradesSection}>
            <View style={s.obHeader}>
              <Text style={s.obLabel}>Price ({quoteSym})</Text>
              <Text style={s.obLabel}>Qty ({base})</Text>
              <Text style={s.obLabel}>Time</Text>
            </View>
            {recentTrades.map(t => (
              <View key={t.id} style={s.tradeRow}>
                <Text style={[s.tradePrice, { color: t.side === 'buy' ? colors.success : colors.danger }]}>
                  {fmt(t.price, isInr ? 2 : 4)}
                </Text>
                <Text style={s.tradeQty}>{Number(t.qty).toFixed(4)}</Text>
                <Text style={s.tradeTime}>{new Date(t.ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Text>
              </View>
            ))}
            {recentTrades.length < 15 && [...Array(15 - recentTrades.length)].map((_, i) => (
              <View key={`pt${i}`} style={s.tradeRow}>
                <Text style={[s.tradePrice, { color: i % 2 === 0 ? colors.success : colors.danger, opacity: 0.3 }]}>— — — —</Text>
                <Text style={[s.tradeQty, { opacity: 0.3 }]}>— — — —</Text>
                <Text style={[s.tradeTime, { opacity: 0.3 }]}>— —:— —:— —</Text>
              </View>
            ))}
            {recentTrades.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 11 }}>Waiting for trades...</Text>
              </View>
            )}
          </View>
        )}

        {/* Buy/Sell Form */}
        <View style={s.tradeForm}>
          {/* Side Toggle */}
          <View style={s.sideRow}>
            <TouchableOpacity style={[s.sideBtn, side === 'buy' && { backgroundColor: colors.success }]} onPress={() => setSide('buy')}>
              <Text style={[s.sideBtnText, side === 'buy' && { color: '#fff' }]}>Buy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.sideBtn, side === 'sell' && { backgroundColor: colors.danger }]} onPress={() => setSide('sell')}>
              <Text style={[s.sideBtnText, side === 'sell' && { color: '#fff' }]}>Sell</Text>
            </TouchableOpacity>
          </View>

          {/* Order Type */}
          <View style={s.orderTypeRow}>
            {(['limit', 'market', 'stop'] as OrderType[]).map(t => (
              <TouchableOpacity key={t} style={[s.orderTypeBtn, orderType === t && { borderBottomWidth: 2, borderBottomColor: colors.primary }]} onPress={() => setOrderType(t)}>
                <Text style={[s.orderTypeText, orderType === t && { color: colors.primary }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Balance */}
          <View style={s.balRow}>
            <Text style={s.balLabel}>Available:</Text>
            <Text style={s.balValue}>{side === 'buy' ? `${ccy}${availableBalance.toLocaleString(locale, { maximumFractionDigits: isInr ? 2 : 4 })}` : `${availableBalance} ${base}`}</Text>
          </View>

          {/* Price */}
          {orderType !== 'market' && (
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Price ({quoteSym})</Text>
              <View style={s.inputRow}>
                <TextInput style={s.tradeInput} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
                <TouchableOpacity onPress={() => setPrice(displayPrice.toFixed(isInr ? 2 : 4))}>
                  <Text style={s.bestPrice}>Best</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Qty */}
          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>Quantity ({base})</Text>
            <View style={s.inputRow}>
              <TextInput style={s.tradeInput} value={qty} onChangeText={setQty} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
            </View>
          </View>

          {/* Percent Buttons */}
          <View style={s.percentRow}>
            {[25, 50, 75, 100].map(p => (
              <TouchableOpacity key={p} style={[s.percentBtn, percent === p && { backgroundColor: side === 'buy' ? colors.success : colors.danger, borderColor: 'transparent' }]} onPress={() => {
                setPercent(p);
                const total = availableBalance * p / 100;
                const orderPrice = orderType === 'market' ? displayPrice : parseFloat(price || '0');
                const calcQty = side === 'buy' && orderPrice > 0 ? total / orderPrice : total;
                setQty(calcQty.toFixed(6));
              }}>
                <Text style={[s.percentText, percent === p && { color: '#fff' }]}>{p}%</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Total */}
          {qty && (() => {
            const px = orderType === 'market' ? displayPrice : parseFloat(price || '0');
            const tot = parseFloat(qty || '0') * px;
            return (
              <View style={s.totalBox}>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Total</Text>
                  <Text style={s.totalValue}>{ccy}{fmt(tot)}</Text>
                </View>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Fee (0.2%)</Text>
                  <Text style={s.totalValue}>{ccy}{(tot * 0.002).toFixed(2)}</Text>
                </View>
                {side === 'sell' && isInr && (
                  <View style={s.totalRow}>
                    <Text style={[s.totalLabel, { color: '#F0B90B' }]}>TDS (1%)</Text>
                    <Text style={[s.totalValue, { color: '#F0B90B' }]}>{ccy}{(tot * 0.01).toFixed(2)}</Text>
                  </View>
                )}
              </View>
            );
          })()}

          {/* Submit */}
          <TouchableOpacity style={[s.submitBtn, { backgroundColor: side === 'buy' ? colors.success : colors.danger }]} onPress={handleOrder}>
            <Text style={s.submitBtnText}>{side === 'buy' ? 'Buy' : 'Sell'} {base}</Text>
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
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  headerSymbol: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.foreground },
  botBadge: { backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2 },
  headerPrice: { alignItems: 'flex-end' },
  currentPrice: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  changeText: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 1 },
  statsBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  statItem: { alignItems: 'center' },
  statLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
  statValue: { fontSize: 12, color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  periodRow: { paddingHorizontal: 16, paddingVertical: 8 },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginRight: 6, backgroundColor: colors.secondary },
  periodText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
  chartContainer: { paddingHorizontal: 16, paddingBottom: 8 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
  orderBook: { paddingHorizontal: 16 },
  obHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  obLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', flex: 1, textAlign: 'center' },
  obRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, position: 'relative' },
  obFill: { position: 'absolute', top: 0, right: 0, bottom: 0, borderRadius: 2 },
  obPrice: { fontSize: 12, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: 'center' },
  obQty: { fontSize: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', flex: 1, textAlign: 'center' },
  obTotal: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', flex: 1, textAlign: 'center' },
  midPrice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  midPriceText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  tradesSection: { paddingHorizontal: 16 },
  tradeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  tradePrice: { fontSize: 12, fontFamily: 'Inter_600SemiBold', flex: 1 },
  tradeQty: { fontSize: 12, color: colors.foreground, fontFamily: 'Inter_400Regular', flex: 1, textAlign: 'center' },
  tradeTime: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', flex: 1, textAlign: 'right' },
  tradeForm: { padding: 16 },
  sideRow: { flexDirection: 'row', backgroundColor: colors.secondary, borderRadius: 10, padding: 4, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  sideBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  sideBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.mutedForeground },
  orderTypeRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 14 },
  orderTypeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  orderTypeText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
  balRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginBottom: 10 },
  balLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
  balValue: { fontSize: 12, color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.secondary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderWidth: 1, borderColor: colors.border },
  tradeInput: { flex: 1, fontSize: 15, color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
  bestPrice: { fontSize: 12, color: colors.primary, fontFamily: 'Inter_500Medium' },
  percentRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  percentBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.secondary },
  percentText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
  totalBox: { backgroundColor: colors.secondary, borderRadius: 8, padding: 12, marginBottom: 14, gap: 6, borderWidth: 1, borderColor: colors.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
  totalValue: { fontSize: 12, color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
  submitBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  myOrderCard: { backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  myOrderLbl: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' },
  myOrderVal: { fontSize: 12, color: colors.foreground, fontFamily: 'Inter_700Bold', marginTop: 2 },
});
