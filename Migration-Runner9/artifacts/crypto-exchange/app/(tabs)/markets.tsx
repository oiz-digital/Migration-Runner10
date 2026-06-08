import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, StatusBar, Platform, Animated, ScrollView, ActivityIndicator
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { marketApi } from "@/lib/api";

interface Coin {
  id: string; symbol: string; name: string; price: number; change: number;
  vol24h: string; mcap: string; color: string; history: number[];
  high24h: number; low24h: number; rank: number; quote?: string;
}

const BASE_COINS: Coin[] = [
  { id:"btc", symbol:"BTC", name:"Bitcoin",   price:64250.50, change: 2.5,  vol24h:"32.5B", mcap:"1.26T", color:"#F7931A", rank:1,  high24h:65200, low24h:62800, history:[61000,62200,61800,63400,62900,64100,63800,65200,64500,64251] },
  { id:"eth", symbol:"ETH", name:"Ethereum",  price: 3180.20, change:-1.2,  vol24h:"15.2B", mcap:"382B",  color:"#627EEA", rank:2,  high24h:3310,  low24h:3080,  history:[3280,3210,3310,3180,3220,3150,3190,3100,3200,3180] },
  { id:"bnb", symbol:"BNB", name:"BNB",       price:  580.40, change: 5.4,  vol24h:"2.1B",  mcap:"84B",   color:"#F3BA2F", rank:4,  high24h:592,   low24h:548,   history:[555,560,558,568,572,576,574,580,578,580] },
  { id:"sol", symbol:"SOL", name:"Solana",    price:  142.60, change: 8.2,  vol24h:"4.5B",  mcap:"65B",   color:"#9945FF", rank:5,  high24h:148,   low24h:132,   history:[130,133,135,138,140,137,142,145,143,143] },
  { id:"ada", symbol:"ADA", name:"Cardano",   price:    0.45, change:-0.5,  vol24h:"350M",  mcap:"16B",   color:"#0033AD", rank:8,  high24h:0.468, low24h:0.440, history:[0.46,0.455,0.46,0.458,0.452,0.456,0.45,0.448,0.452,0.45] },
  { id:"xrp", symbol:"XRP", name:"XRP",       price:    0.59, change: 1.8,  vol24h:"1.2B",  mcap:"32B",   color:"#00AAE4", rank:6,  high24h:0.602, low24h:0.571, history:[0.575,0.578,0.58,0.585,0.582,0.588,0.586,0.590,0.588,0.59] },
  { id:"doge",symbol:"DOGE",name:"Dogecoin",  price:   0.168, change: 3.1,  vol24h:"890M",  mcap:"24B",   color:"#C2A633", rank:9,  high24h:0.175, low24h:0.159, history:[0.160,0.162,0.161,0.163,0.165,0.164,0.166,0.165,0.167,0.168] },
  { id:"dot", symbol:"DOT", name:"Polkadot",  price:    7.82, change:-2.1,  vol24h:"310M",  mcap:"10B",   color:"#E6007A", rank:12, high24h:8.10,  low24h:7.72,  history:[8.1,8.0,7.9,7.85,7.88,7.82,7.78,7.80,7.83,7.82] },
  { id:"avax",symbol:"AVAX",name:"Avalanche", price:   38.40, change: 4.6,  vol24h:"520M",  mcap:"16B",   color:"#E84142", rank:11, high24h:39.5,  low24h:36.2,  history:[36,36.5,37,37.5,38,37.8,38.2,38.5,38.3,38.4] },
  { id:"link",symbol:"LINK",name:"Chainlink", price:   14.80, change: 1.2,  vol24h:"280M",  mcap:"8.7B",  color:"#2A5ADA", rank:14, high24h:15.1,  low24h:14.2,  history:[14.2,14.4,14.3,14.5,14.6,14.4,14.7,14.8,14.75,14.80] },
  { id:"matic",symbol:"MATIC",name:"Polygon",  price:   0.72, change:-0.8,  vol24h:"210M",  mcap:"7.1B",  color:"#8247E5", rank:15, high24h:0.745, low24h:0.698, history:[0.74,0.735,0.728,0.72,0.715,0.718,0.722,0.719,0.721,0.72] },
  { id:"atom",symbol:"ATOM",name:"Cosmos",    price:    9.45, change: 2.8,  vol24h:"150M",  mcap:"3.7B",  color:"#2E3148", rank:23, high24h:9.72,  low24h:9.10,  history:[9.0,9.1,9.3,9.2,9.4,9.35,9.5,9.48,9.45,9.45] },
];

const TRENDING = [
  { symbol: "SOL",  change: 8.2,  price: "142.60",  color: "#9945FF" },
  { symbol: "BNB",  change: 5.4,  price: "580.40",  color: "#F3BA2F" },
  { symbol: "AVAX", change: 4.6,  price: "38.40",   color: "#E84142" },
  { symbol: "DOGE", change: 3.1,  price: "0.1680",  color: "#C2A633" },
  { symbol: "ATOM", change: 2.8,  price: "9.45",    color: "#2E3148" },
];

function Sparkline({ data, color, width = 64, height = 30 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const segW = width / (data.length - 1);
  return (
    <View style={{ width, height, overflow: "hidden" }}>
      {data.slice(0, -1).map((val, i) => {
        const nextVal = data[i + 1];
        const y1 = height - ((val - min) / range) * (height - 2) - 1;
        const y2 = height - ((nextVal - min) / range) * (height - 2) - 1;
        const angle = Math.atan2(y2 - y1, segW) * (180 / Math.PI);
        const len = Math.sqrt(segW * segW + (y2 - y1) * (y2 - y1));
        return (
          <View key={i} style={{
            position: "absolute", left: i * segW, top: Math.min(y1, y2),
            width: len, height: 1.5, backgroundColor: color, opacity: 0.9,
            transform: [{ rotate: `${angle}deg` }],
            transformOrigin: "0 50%",
          } as any} />
        );
      })}
      {/* Area fill approximation */}
      {data.map((val, i) => {
        const x = i * segW;
        const y = height - ((val - min) / range) * (height - 2) - 1;
        return (
          <View key={`a${i}`} style={{
            position: "absolute", left: x, top: y,
            width: segW, height: height - y,
            backgroundColor: color, opacity: 0.06,
          }} />
        );
      })}
    </View>
  );
}

function CoinRow({ item, fav, onFav }: { item: Coin; fav: boolean; onFav: () => void }) {
  const colors = useColors();
  const priceAnim = useRef(new Animated.Value(1)).current;
  const bgAnim = useRef(new Animated.Value(0)).current;
  const isUp = item.change >= 0;
  const prevRef = useRef(item.price);

  useEffect(() => {
    const dir = item.price > prevRef.current ? 1 : -1;
    prevRef.current = item.price;
    Animated.sequence([
      Animated.timing(priceAnim, { toValue: 1.04, duration: 100, useNativeDriver: true }),
      Animated.timing(priceAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.timing(bgAnim, { toValue: 1, duration: 120, useNativeDriver: false }),
      Animated.timing(bgAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
    ]).start();
  }, [item.price]);

  const isInr = (item.quote ?? "").toUpperCase() === "INR";
  const currencySym = isInr ? "₹" : "$";
  const fmtPrice = (p: number) => p >= 1
    ? p.toLocaleString(isInr ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : p.toFixed(4);

  const flashBg = bgAnim.interpolate({
    inputRange: [0, 1], outputRange: ["transparent", isUp ? "#0ecb8115" : "#f6465d15"],
  } as any);

  return (
    <Animated.View style={{ backgroundColor: flashBg }}>
      <TouchableOpacity
        testID={`coin-row-${item.id}`}
        onPress={() => Haptics.selectionAsync()}
        activeOpacity={0.7}
        style={[styles.coinRow, { borderBottomColor: colors.border }]}
      >
        <TouchableOpacity onPress={() => { onFav(); Haptics.selectionAsync(); }} style={styles.starBtn}>
          <Feather name={fav ? "star" : "star"} size={13} color={fav ? "#fcd535" : colors.mutedForeground} solid={fav} />
        </TouchableOpacity>
        <View style={[styles.coinLogo, { backgroundColor: item.color + "22" }]}>
          <Text style={[styles.coinLogoText, { color: item.color }]}>{item.symbol[0]}</Text>
        </View>
        <View style={styles.coinInfo}>
          <View style={styles.coinNameRow}>
            <Text style={[styles.coinSymbol, { color: colors.foreground }]}>{item.symbol}</Text>
            <Text style={[styles.coinRank, { color: colors.mutedForeground }]}>#{item.rank}</Text>
          </View>
          <Text style={[styles.coinVol, { color: colors.mutedForeground }]}>Vol {item.vol24h}</Text>
        </View>
        <View style={styles.coinSparkline}>
          <Sparkline data={item.history} color={isUp ? "#0ecb81" : "#f6465d"} />
        </View>
        <View style={styles.coinPriceBlock}>
          <Animated.Text style={[styles.coinPrice, { color: colors.foreground, transform: [{ scale: priceAnim }] }]}>
            {currencySym}{fmtPrice(item.price)}
          </Animated.Text>
          <View style={[styles.changeBadge, { backgroundColor: (isUp ? "#0ecb81" : "#f6465d") + "1a" }]}>
            <Text style={[styles.changeText, { color: isUp ? "#0ecb81" : "#f6465d" }]}>
              {isUp ? "▲" : "▼"} {Math.abs(item.change).toFixed(2)}%
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const CATS = ["All","Spot","Futures","Gainers","Losers","⭐"];

const COIN_COLORS: Record<string, string> = {
  BTC:"#F7931A", ETH:"#627EEA", BNB:"#F3BA2F", SOL:"#9945FF",
  XRP:"#00AAE4", ADA:"#0033AD", DOGE:"#C2A633", DOT:"#E6007A",
  AVAX:"#E84142", LINK:"#2A5ADA", USDT:"#26A17B",
};

export default function MarketsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [sortBy, setSortBy] = useState<"vol"|"change"|"price"|"mcap">("vol");
  const [sortDir, setSortDir] = useState<1|-1>(-1);
  const [favorites, setFavorites] = useState<string[]>(["btc","eth"]);
  const [fearGreed] = useState(62);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const { data: marketsData = [], isLoading: marketsLoading } = useQuery({
    queryKey: ["mobile-markets"],
    queryFn: marketApi.getMarkets,
    refetchInterval: 30000,
  });

  const coins: Coin[] = marketsData.map((m: any) => ({
    id: (m.symbol ?? m.base ?? "").toLowerCase(),
    symbol: m.base ?? m.symbol,
    name: m.quote ? `${m.base}/${m.quote}` : (m.base ?? m.symbol),
    price: m.price ?? 0,
    change: m.change24h ?? 0,
    vol24h: m.volume24h ? `${(m.volume24h / 1e9).toFixed(1)}B` : "0",
    mcap: "--",
    color: COIN_COLORS[m.base] ?? "#888",
    history: Array.from({ length: 10 }, () => (m.price ?? 0) * (1 + (Math.random() - 0.499) * 0.05)),
    high24h: m.high24h ?? 0,
    low24h: m.low24h ?? 0,
    rank: 0,
    quote: m.quote,
  }));

  const toggleFav = useCallback((id: string) => {
    setFavorites(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  }, []);

  const handleSort = (s: typeof sortBy) => {
    if (sortBy === s) setSortDir(d => (d === -1 ? 1 : -1) as 1 | -1);
    else { setSortBy(s); setSortDir(-1); }
  };

  const filtered = coins
    .filter(c => {
      const q = search.toLowerCase();
      const m = c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
      if (cat === "Gainers") return m && c.change > 0;
      if (cat === "Losers") return m && c.change < 0;
      if (cat === "⭐") return m && favorites.includes(c.id);
      if (cat === "Spot") {
        const md: any = marketsData.find((x: any) => x.symbol === (c as any).name || `${x.base}/${x.quote}` === (c as any).name);
        return m && (md?.tradingEnabled !== false);
      }
      if (cat === "Futures") {
        const md: any = marketsData.find((x: any) => x.symbol === (c as any).name || `${x.base}/${x.quote}` === (c as any).name);
        return m && !!md?.futuresEnabled;
      }
      return m;
    })
    .sort((a, b) => {
      let v = 0;
      if (sortBy === "change") v = a.change - b.change;
      else if (sortBy === "price") v = a.price - b.price;
      return v * sortDir;
    });

  const SortHeader = ({ label, key: k }: { label: string; key: typeof sortBy }) => (
    <TouchableOpacity onPress={() => handleSort(k)} style={styles.sortHeaderBtn}>
      <Text style={[styles.colHeaderText, { color: sortBy === k ? colors.primary : colors.mutedForeground }]}>{label}</Text>
      {sortBy === k && <Text style={{ color: colors.primary, fontSize: 8 }}>{sortDir === -1 ? "▼" : "▲"}</Text>}
    </TouchableOpacity>
  );

  const ListHeader = () => (
    <View>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.primary }]}>CryptoX</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Markets</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.secondary }]}>
            <Feather name="bell" size={17} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.secondary }]}>
            <Feather name="sliders" size={17} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Market Overview Bar */}
      <View style={[styles.overviewBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: "Market Cap", value: "$2.41T", color: colors.foreground },
          { label: "24H Vol", value: "$98.5B", color: colors.foreground },
          { label: "BTC Dom", value: "52.3%", color: colors.primary },
          { label: "Fear & Greed", value: `${fearGreed}`, color: fearGreed > 50 ? colors.success : colors.destructive },
        ].map((s, i) => (
          <View key={s.label} style={[styles.overviewItem, { borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: colors.border }]}>
            <Text style={[styles.ovLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            <Text style={[styles.ovValue, { color: s.color }]}>{s.value}</Text>
          </View>
        ))}
      </View>

      {/* Trending */}
      <View style={{ paddingVertical: 10 }}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, paddingHorizontal: 16, marginBottom: 8 }]}>
          🔥 Trending
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
          {TRENDING.map(t => (
            <TouchableOpacity key={t.symbol} onPress={() => Haptics.selectionAsync()}
              style={[styles.trendCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.trendLogo, { backgroundColor: t.color + "22" }]}>
                <Text style={[styles.trendLogoText, { color: t.color }]}>{t.symbol[0]}</Text>
              </View>
              <Text style={[styles.trendSym, { color: colors.foreground }]}>{t.symbol}</Text>
              <Text style={[styles.trendPrice, { color: colors.mutedForeground }]}>${t.price}</Text>
              <View style={[styles.trendBadge, { backgroundColor: "#0ecb8118" }]}>
                <Text style={[styles.trendChange, { color: "#0ecb81" }]}>+{t.change}%</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Feather name="search" size={15} color={colors.mutedForeground} style={{ marginRight: 8 }} />
        <TextInput
          testID="search-input"
          value={search} onChangeText={setSearch}
          placeholder="Search name or symbol..."
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
        {CATS.map(c => (
          <TouchableOpacity key={c} testID={`cat-${c}`} onPress={() => setCat(c)}
            style={[styles.catTab, { borderColor: cat === c ? colors.primary : "transparent", backgroundColor: cat === c ? colors.primary + "18" : "transparent" }]}>
            <Text style={[styles.catText, { color: cat === c ? colors.primary : colors.mutedForeground }]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Column Headers */}
      <View style={[styles.colHeader, { borderBottomColor: colors.border, borderTopColor: colors.border }]}>
        <View style={{ width: 14 }} />
        <Text style={[styles.colHeaderText, { color: colors.mutedForeground, width: 44 }]}> </Text>
        <Text style={[styles.colHeaderText, { color: colors.mutedForeground, flex: 2 }]}>Name</Text>
        <Text style={[styles.colHeaderText, { color: colors.mutedForeground, width: 68 }]}>7D Chart</Text>
        <View style={{ flex: 2, alignItems: "flex-end" }}>
          <View style={styles.sortRow}>
            <SortHeader label="Price" key="price" />
            <Text style={{ color: colors.border }}>·</Text>
            <SortHeader label="Chg%" key="change" />
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }) => (
          <CoinRow item={item} fav={favorites.includes(item.id)} onFav={() => toggleFav(item.id)} />
        )}
        ListEmptyComponent={marketsLoading ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <ActivityIndicator color="#fcd535" size="large" />
          </View>
        ) : (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: "#888", fontSize: 14 }}>No markets found</Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? bottomPad + 84 : 90 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  headerRight: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  overviewBar: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 8 },
  overviewItem: { flex: 1, alignItems: "center", paddingVertical: 2 },
  ovLabel: { fontSize: 9, fontFamily: "Inter_400Regular", marginBottom: 2 },
  ovValue: { fontSize: 11, fontFamily: "Inter_700Bold" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  trendCard: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, minWidth: 90, gap: 4 },
  trendLogo: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  trendLogoText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  trendSym: { fontSize: 12, fontFamily: "Inter_700Bold" },
  trendPrice: { fontSize: 10, fontFamily: "Inter_400Regular" },
  trendBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  trendChange: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, marginBottom: 10, marginTop: 4 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  catRow: { paddingHorizontal: 12, gap: 6, paddingBottom: 8 },
  catTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  catText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  colHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1, borderTopWidth: 1 },
  colHeaderText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  sortHeaderBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  coinRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 11, borderBottomWidth: 1 },
  starBtn: { width: 20, alignItems: "center", marginRight: 2 },
  coinLogo: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 8 },
  coinLogoText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  coinInfo: { flex: 2 },
  coinNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  coinSymbol: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  coinRank: { fontSize: 9, fontFamily: "Inter_400Regular" },
  coinVol: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  coinSparkline: { width: 68, alignItems: "center" },
  coinPriceBlock: { flex: 2, alignItems: "flex-end" },
  coinPrice: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  changeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, marginTop: 3 },
  changeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
});
