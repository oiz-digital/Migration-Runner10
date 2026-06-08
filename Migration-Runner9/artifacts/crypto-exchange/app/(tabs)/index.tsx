import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Platform, FlatList, Animated, Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { marketApi, promoApi } from "@/lib/api";

const COIN_COLORS: Record<string, string> = {
  BTC: "#F7931A", ETH: "#627EEA", BNB: "#F3BA2F", SOL: "#14F195",
  XRP: "#0085C0", DOGE: "#C2A633", MATIC: "#8247E5", USDT: "#26A17B",
  ADA: "#0033AD", AVAX: "#E84142", ATOM: "#2E3148",
};

const QUICK_ACTIONS = [
  { label: "Deposit",  icon: "arrow-down-circle", route: "/services/deposit-inr",     color: "#0ecb81", auth: true },
  { label: "Withdraw", icon: "arrow-up-circle",   route: "/services/withdraw-inr",    color: "#f6465d", auth: true },
  { label: "Buy",      icon: "credit-card",       route: "/(tabs)/trade",             color: "#5b8def", auth: false },
  { label: "Earn",     icon: "trending-up",       route: "/services/earn",            color: "#a06af5", auth: true },
  { label: "Transfer", icon: "repeat",            route: "/services/transfer",        color: "#00c2ff", auth: true },
  { label: "Refer",    icon: "gift",              route: "/services/refer",           color: "#ff8a3d", auth: true },
  { label: "Banks",    icon: "home",              route: "/services/banks",           color: "#fcd535", auth: true },
  { label: "More",     icon: "grid",              route: "/(tabs)/account",           color: "#8d96a7", auth: false },
];

const FALLBACK_BANNERS: any[] = [];

type MarketTab = "Hot" | "Gainers" | "Losers" | "New";
const MARKET_TABS: MarketTab[] = ["Hot", "Gainers", "Losers", "New"];
type MarketKind = "spot" | "futures";
type QuoteFilter = "INR" | "USDT";

// Live price row with flash effect on price change
function LivePriceRow({
  c, i, last, isFutures, colors, onPress, formatPrice,
}: {
  c: any; i: number; last: boolean; isFutures: boolean;
  colors: any; onPress: () => void; formatPrice: (p: number, q: string) => string;
}) {
  const flash = useRef(new Animated.Value(0)).current;
  const prevRef = useRef<number>(c.price);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (c.price !== prevRef.current && prevRef.current > 0) {
      const dir = c.price > prevRef.current ? "up" : "down";
      setDirection(dir);
      flash.setValue(1);
      Animated.timing(flash, {
        toValue: 0, duration: 800, useNativeDriver: false, easing: Easing.out(Easing.quad),
      }).start();
    }
    prevRef.current = c.price;
  }, [c.price]);

  const up = c.change24h >= 0;
  const flashColor = direction === "up" ? "#0ecb81" : "#f6465d";
  const bgFlash = flash.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(0,0,0,0)", flashColor + "33"],
  });
  const priceColor = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.foreground, flashColor],
  });

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      <Animated.View
        style={[styles.row, {
          backgroundColor: bgFlash,
          borderBottomColor: colors.border,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        }]}
      >
        <View style={[styles.rankBadge, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.rankBadgeTxt, { color: colors.mutedForeground }]}>{i + 1}</Text>
        </View>
        <View style={[styles.coinDot, { backgroundColor: (COIN_COLORS[c.base] || "#888") + "33" }]}>
          <Text style={[styles.coinDotTxt, { color: COIN_COLORS[c.base] || "#888" }]}>{(c.base || "?")[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text style={[styles.rowSym, { color: colors.foreground }]}>
              {c.base}<Text style={{ color: colors.mutedForeground, fontSize: 11 }}>/{c.quote}</Text>
            </Text>
            {isFutures && (
              <View style={[styles.permBadge, { backgroundColor: "#f3ba2f22" }]}>
                <Text style={[styles.permBadgeTxt, { color: "#f3ba2f" }]}>PERP</Text>
              </View>
            )}
            {direction && (
              <Animated.View style={{ opacity: flash }}>
                <Feather name={direction === "up" ? "arrow-up" : "arrow-down"} size={9} color={flashColor} />
              </Animated.View>
            )}
          </View>
          <Text style={[styles.rowVol, { color: colors.mutedForeground }]}>Vol {(c.volume24h / 1e6).toFixed(2)}M</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Animated.Text style={[styles.rowPrice, { color: priceColor }]}>{formatPrice(c.price, c.quote)}</Animated.Text>
          <View style={[styles.changeBadge, { backgroundColor: (up ? colors.success : colors.destructive) + "22" }]}>
            <Feather name={up ? "arrow-up-right" : "arrow-down-right"} size={9} color={up ? colors.success : colors.destructive} />
            <Text style={[styles.changeBadgeTxt, { color: up ? colors.success : colors.destructive }]}>
              {up ? "+" : ""}{c.change24h.toFixed(2)}%
            </Text>
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, apiWallets, inrUsdtRate, apiCoins } = useApp();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : 90;

  const [search, setSearch] = useState("");
  const [marketTab, setMarketTab] = useState<MarketTab>("Hot");
  const [marketKind, setMarketKind] = useState<MarketKind>("spot");
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>("INR");
  const [hideBalance, setHideBalance] = useState(false);
  const [bannerIdx, setBannerIdx] = useState(0);
  const bannerRef = useRef<FlatList>(null);

  // Animations
  const tabFade = useRef(new Animated.Value(1)).current;
  const kindIndicator = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [segmentW, setSegmentW] = useState(0);

  const { data: marketsData = [] } = useQuery({
    queryKey: ["home-markets"],
    queryFn: marketApi.getMarkets,
    refetchInterval: 30000,
  });

  const { data: bannersData = [] } = useQuery({
    queryKey: ["home-banners"],
    queryFn: promoApi.getBanners,
    refetchInterval: 60000,
  });

  const { data: promotionsData = [] } = useQuery({
    queryKey: ["home-promotions"],
    queryFn: promoApi.getPromotions,
    refetchInterval: 60000,
  });

  const BANNERS = useMemo(() => {
    if (!bannersData?.length) return FALLBACK_BANNERS;
    return bannersData.map((b: any) => ({
      id: b.id,
      title: b.title,
      sub: b.subtitle,
      grad: [b.bgColor, b.bgColor],
      bg: b.bgColor,
      icon: b.icon || "shield",
      fg: b.fgColor || "#000",
      ctaUrl: b.ctaUrl || "",
      ctaLabel: b.ctaLabel || "",
    }));
  }, [bannersData]);

  const PROMOS = useMemo(() => {
    return (promotionsData || []).map((p: any) => ({
      id: p.id,
      tag: p.tag,
      title: p.title,
      sub: p.subtitle,
      color: p.color,
      icon: p.icon || "award",
      ctaLabel: p.ctaLabel || "Learn more",
      ctaUrl: p.ctaUrl || "",
      prizePool: p.prizePool || "",
    }));
  }, [promotionsData]);

  // Auto-rotate banners (guarded against empty list & scroll failures)
  useEffect(() => {
    if (!BANNERS.length) return;
    const len = BANNERS.length;
    const id = setInterval(() => {
      setBannerIdx(i => {
        const next = (i + 1) % len;
        try { bannerRef.current?.scrollToIndex({ index: next, animated: true }); } catch {}
        return next;
      });
    }, 4500);
    return () => clearInterval(id);
  }, [BANNERS.length]);

  const totalInr = useMemo(() => {
    if (!user?.isLoggedIn) return 0;
    return (apiWallets || []).reduce((s: number, w: any) => s + Number(w.inrValue || 0), 0);
  }, [apiWallets, user]);

  const portfolioBreakdown = useMemo(() => {
    const acc = { spot: 0, futures: 0, earn: 0 };
    if (!user?.isLoggedIn) return acc;
    for (const w of (apiWallets || []) as any[]) {
      const t = String(w.walletType || "spot").toLowerCase();
      const v = Number(w.inrValue || 0);
      if (t === "futures") acc.futures += v;
      else if (t === "earn") acc.earn += v;
      else acc.spot += v;
    }
    return acc;
  }, [apiWallets, user]);

  const dayPnl = useMemo(() => {
    if (!user?.isLoggedIn || !marketsData.length || !apiWallets?.length) return { abs: 0, pct: 0 };
    let prev = 0, cur = 0;
    (apiWallets || []).forEach((w: any) => {
      const m: any = marketsData.find((x: any) => x.base === w.symbol);
      const inr = Number(w.inrValue || 0);
      const ch = Number(m?.change24h || 0);
      cur += inr;
      prev += ch !== 0 ? inr / (1 + ch / 100) : inr;
    });
    const abs = cur - prev;
    const pct = prev > 0 ? (abs / prev) * 100 : 0;
    return { abs, pct };
  }, [apiWallets, marketsData, user]);

  // Live price overlay: merge WS-driven apiCoins ticks into REST market rows
  const livePriceMap = useMemo(() => {
    const m = new Map<string, { usdt: number; inr: number; change: number }>();
    for (const c of (apiCoins || [])) {
      m.set(c.symbol, {
        usdt: Number((c as any).currentPrice ?? 0),
        inr: Number((c as any).priceInr ?? 0),
        change: Number((c as any).change24h ?? 0),
      });
    }
    return m;
  }, [apiCoins]);

  // Filter by market kind (spot|futures) and quote (INR|USDT) — overlay live prices
  const eligible = useMemo(() => {
    return (marketsData || [])
      .filter((m: any) => {
        if (m.quote !== quoteFilter) return false;
        if (marketKind === "futures" && !m.futuresEnabled) return false;
        if (marketKind === "spot" && m.tradingEnabled === false) return false;
        return true;
      })
      .map((m: any) => {
        const live = livePriceMap.get(m.base);
        if (!live) return m;
        const price = m.quote === "INR" ? (live.inr || m.price) : (live.usdt || m.price);
        return { ...m, price, change24h: live.change || m.change24h };
      });
  }, [marketsData, marketKind, quoteFilter, livePriceMap]);

  const hot = useMemo(() => [...eligible].sort((a: any, b: any) => (b.volume24h || 0) - (a.volume24h || 0)).slice(0, 6), [eligible]);
  const gainers = useMemo(() => [...eligible].filter((c: any) => c.change24h > 0).sort((a: any, b: any) => b.change24h - a.change24h).slice(0, 6), [eligible]);
  const losers = useMemo(() => [...eligible].filter((c: any) => c.change24h < 0).sort((a: any, b: any) => a.change24h - b.change24h).slice(0, 6), [eligible]);
  const newCoins = useMemo(() => [...eligible].sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6), [eligible]);

  // Animate kind indicator (translateX based on measured container width)
  useEffect(() => {
    Animated.spring(kindIndicator, { toValue: marketKind === "spot" ? 0 : 1, useNativeDriver: true, friction: 7, tension: 80 }).start();
  }, [marketKind]);
  // Fade the list when tab changes
  useEffect(() => {
    tabFade.setValue(0);
    Animated.timing(tabFade, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [marketTab, marketKind, quoteFilter]);
  // Subtle pulse for "Hot" badge
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const tickerData = useMemo(() => marketsData.slice(0, 12), [marketsData]);

  // Ticker animation
  const tickerX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!tickerData.length) return;
    tickerX.setValue(0);
    const anim = Animated.loop(
      Animated.timing(tickerX, {
        toValue: -1200, duration: 30000, useNativeDriver: true, easing: Easing.linear,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [tickerData.length]);

  const formatPrice = (p: number, quote: string) => {
    const sym = quote === "INR" ? "₹" : "$";
    const loc = quote === "INR" ? "en-IN" : "en-US";
    return `${sym}${p.toLocaleString(loc, { minimumFractionDigits: p < 1 ? 4 : 2, maximumFractionDigits: p < 1 ? 6 : 2 })}`;
  };

  const goLogin = () => { Haptics.selectionAsync(); router.push("/(auth)/login"); };
  const goAction = (route: string, requiresAuth: boolean) => {
    Haptics.selectionAsync();
    if (requiresAuth && !user?.isLoggedIn) { router.push("/(auth)/login"); return; }
    router.push(route as any);
  };

  const filteredCoins = useMemo(() => {
    let list: any[] = [];
    if (marketTab === "Hot") list = hot;
    else if (marketTab === "Gainers") list = gainers;
    else if (marketTab === "Losers") list = losers;
    else list = newCoins;
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((c: any) => (c.base || "").toLowerCase().includes(q) || (c.symbol || "").toLowerCase().includes(q));
  }, [marketTab, hot, gainers, losers, newCoins, search]);

  const kycLevel = user?.kycLevel ?? 0;
  const kycProgress = (kycLevel / 3) * 100;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: topPad, paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={[styles.brandLogo, { backgroundColor: colors.primary }]}>
            <Text style={styles.brandLogoTxt}>Z</Text>
          </View>
          <Text style={[styles.brandName, { color: colors.foreground }]} numberOfLines={1}>ZEBVIX</Text>
        </View>
        <TouchableOpacity onPress={() => goAction("/services/deposit-crypto", true)} style={[styles.iconBtn, { backgroundColor: colors.card }]}>
          <MaterialCommunityIcons name="qrcode-scan" size={17} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(tabs)/markets")} style={[styles.iconBtn, { backgroundColor: colors.card }]}>
          <Feather name="search" size={17} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => goAction("/services/banks", true)} style={[styles.iconBtn, { backgroundColor: colors.card }]}>
          <Feather name="bell" size={17} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(tabs)/account")} style={[styles.iconBtn, { backgroundColor: colors.card }]}>
          <Feather name="user" size={17} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Search bar (replaces the live ticker that used to live here) */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={14} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search BTC, ETH, SOL..."
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x-circle" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Hero — Asset Card / Login CTA */}
      {user?.isLoggedIn ? (
        <View style={[styles.assetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.assetTop}>
            <View>
              <Text style={[styles.assetLabel, { color: colors.mutedForeground }]}>Total Portfolio (INR)</Text>
              <View style={styles.assetValRow}>
                <Text style={[styles.assetValue, { color: colors.foreground }]}>
                  {hideBalance ? "₹••••••" : `₹${totalInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </Text>
                <TouchableOpacity onPress={() => setHideBalance(v => !v)}>
                  <Feather name={hideBalance ? "eye-off" : "eye"} size={15} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.assetSub, { color: colors.mutedForeground }]}>
                ≈ ${(totalInr / (inrUsdtRate || 95)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
              </Text>
            </View>
            <View style={[styles.pnlBadge, { backgroundColor: (dayPnl.pct >= 0 ? colors.success : colors.destructive) + "22" }]}>
              <Feather name={dayPnl.pct >= 0 ? "trending-up" : "trending-down"} size={11} color={dayPnl.pct >= 0 ? colors.success : colors.destructive} />
              <Text style={[styles.pnlTxt, { color: dayPnl.pct >= 0 ? colors.success : colors.destructive }]}>
                {dayPnl.pct >= 0 ? "+" : ""}{dayPnl.pct.toFixed(2)}%
              </Text>
            </View>
          </View>

          {/* KYC progress */}
          {kycLevel === 0 && (
            <TouchableOpacity onPress={() => router.push("/services/kyc" as any)} style={[styles.kycBar, { backgroundColor: colors.secondary }]}>
              <View style={{ flex: 1 }}>
                <View style={styles.kycHead}>
                  <Feather name="shield" size={11} color={colors.primary} />
                  <Text style={[styles.kycText, { color: colors.foreground }]}>KYC Level {kycLevel} → Level {kycLevel + 1}</Text>
                </View>
                <View style={[styles.kycTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.kycFill, { backgroundColor: colors.primary, width: `${kycProgress}%` }]} />
                </View>
              </View>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}

        </View>
      ) : (
        <TouchableOpacity onPress={goLogin} style={[styles.loginCta, { backgroundColor: colors.primary }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.loginCtaTitle, { color: "#fff" }]}>Login or Sign Up</Text>
            <Text style={[styles.loginCtaSub, { color: "#ffffffcc" }]}>Start trading INR & USDT pairs · Get ₹100 bonus</Text>
          </View>
          <View style={styles.loginCtaArrow}><Feather name="arrow-right" size={16} color="#fff" /></View>
        </TouchableOpacity>
      )}

      {/* Quick Actions */}
      <View style={[styles.actionsGrid, { backgroundColor: colors.card }]}>
        {QUICK_ACTIONS.map(a => (
          <TouchableOpacity key={a.label} onPress={() => goAction(a.route, a.auth)} style={styles.actionItem}>
            <View style={[styles.actionIcon, { backgroundColor: a.color + "22" }]}>
              <Feather name={a.icon as any} size={18} color={a.color} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.foreground }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Banner Carousel */}
      {BANNERS.length > 0 && (
        <FlatList
          ref={bannerRef}
          horizontal
          data={BANNERS}
          keyExtractor={(b: any) => String(b.id ?? b.title)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bannerList}
          snapToInterval={290}
          decelerationRate="fast"
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              bannerRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
            }, 100);
          }}
          renderItem={({ item }: any) => (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => item.ctaUrl ? goAction(item.ctaUrl, !item.ctaUrl.startsWith("/(tabs)")) : null}
              style={[styles.banner, { backgroundColor: item.bg || item.grad[0] }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.bannerTitle, { color: item.fg }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.bannerSub, { color: item.fg + "cc" }]} numberOfLines={2}>{item.sub}</Text>
                {item.ctaLabel ? (
                  <View style={[styles.bannerCta, { backgroundColor: item.fg + "22" }]}>
                    <Text style={[styles.bannerCtaTxt, { color: item.fg }]}>{item.ctaLabel} →</Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.bannerIcon, { backgroundColor: item.fg + "22" }]}>
                <Feather name={item.icon as any} size={22} color={item.fg} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
      <View style={styles.dots}>
        {BANNERS.map((_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i === bannerIdx ? colors.primary : colors.border, width: i === bannerIdx ? 16 : 6 }]} />
        ))}
      </View>

      {/* Markets — premium kind+quote selector + animated tabs */}
      <View style={[styles.section, { marginTop: 4 }]}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Markets</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/markets")}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>View All →</Text>
          </TouchableOpacity>
        </View>

        {/* Kind toggle (Spot | Futures) — animated indicator */}
        <View
          onLayout={(e) => setSegmentW(e.nativeEvent.layout.width)}
          style={[styles.segmentRow, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          {segmentW > 0 && (
            <Animated.View style={[styles.segmentIndicator, {
              backgroundColor: colors.primary,
              width: (segmentW - 4) / 2,
              transform: [{
                translateX: kindIndicator.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, (segmentW - 4) / 2],
                }),
              }],
            }]} />
          )}
          {(["spot", "futures"] as MarketKind[]).map(k => (
            <TouchableOpacity key={k} onPress={() => { Haptics.selectionAsync(); setMarketKind(k); }} style={styles.segmentBtn}>
              <Feather name={k === "spot" ? "bar-chart-2" : "zap"} size={12} color={marketKind === k ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.segmentTxt, { color: marketKind === k ? colors.primaryForeground : colors.mutedForeground }]}>{k === "spot" ? "Spot" : "Futures"}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quote pills (INR | USDT) */}
        <View style={styles.quoteRow}>
          {(["INR", "USDT"] as QuoteFilter[]).map(q => {
            const active = quoteFilter === q;
            return (
              <TouchableOpacity
                key={q}
                onPress={() => { Haptics.selectionAsync(); setQuoteFilter(q); }}
                style={[styles.quotePill, {
                  backgroundColor: active ? colors.primary + "22" : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                }]}
              >
                <Text style={[styles.quotePillTxt, { color: active ? colors.primary : colors.mutedForeground }]}>
                  {q === "INR" ? "₹ INR" : "$ USDT"}
                </Text>
              </TouchableOpacity>
            );
          })}
          <View style={{ flex: 1 }} />
          <Text style={[styles.eligibleCount, { color: colors.mutedForeground }]}>{eligible.length} pairs</Text>
        </View>

        {/* Tab strip */}
        <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
          {MARKET_TABS.map(t => {
            const active = marketTab === t;
            return (
              <TouchableOpacity key={t} onPress={() => { setMarketTab(t); Haptics.selectionAsync(); }} style={styles.tabItem}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  {t === "Hot" && (
                    <Animated.View style={{
                      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
                      transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] }) }],
                    }}>
                      <Feather name="zap" size={10} color={active ? colors.primary : "#f6465d"} />
                    </Animated.View>
                  )}
                  {t === "Gainers" && <Feather name="trending-up" size={10} color={active ? colors.primary : "#0ecb81"} />}
                  {t === "Losers" && <Feather name="trending-down" size={10} color={active ? colors.primary : "#f6465d"} />}
                  {t === "New" && <Feather name="star" size={10} color={active ? colors.primary : "#a06af5"} />}
                  <Text style={[styles.tabTxt, { color: active ? colors.primary : colors.mutedForeground }]}>{t}</Text>
                </View>
                {active && <View style={[styles.tabUnderline, { backgroundColor: colors.primary }]} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Animated coin list */}
        <Animated.View style={{ opacity: tabFade, transform: [{ translateY: tabFade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
          <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {filteredCoins.length === 0 && (
              <View style={{ paddingVertical: 28, alignItems: "center" }}>
                <Feather name="inbox" size={22} color={colors.mutedForeground} />
                <Text style={[styles.empty, { color: colors.mutedForeground, marginTop: 6 }]}>
                  No {quoteFilter} {marketKind} pairs in {marketTab}
                </Text>
              </View>
            )}
            {filteredCoins.map((c: any, i: number) => (
              <LivePriceRow
                key={c.symbol}
                c={c}
                i={i}
                last={i === filteredCoins.length - 1}
                isFutures={marketKind === "futures"}
                colors={colors}
                formatPrice={formatPrice}
                onPress={() => {
                  Haptics.selectionAsync();
                  router.push(`/(tabs)/${marketKind === "futures" ? "futures" : "trade"}?pair=${c.symbol}` as any);
                }}
              />
            ))}
          </View>
        </Animated.View>
      </View>

      {/* Discover */}
      {PROMOS.length > 0 && (
        <View style={[styles.section, { marginTop: 14 }]}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Discover</Text>
            <TouchableOpacity><Text style={[styles.seeAll, { color: colors.primary }]}>More →</Text></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>
            {PROMOS.map((d: any) => (
              <TouchableOpacity
                key={d.id}
                onPress={() => d.ctaUrl ? goAction(d.ctaUrl, !d.ctaUrl.startsWith("/(tabs)")) : null}
                style={[styles.discCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[styles.discTagRow]}>
                  <View style={[styles.discTag, { backgroundColor: d.color + "22" }]}>
                    <Text style={[styles.discTagTxt, { color: d.color }]}>{d.tag}</Text>
                  </View>
                  <Feather name={d.icon as any} size={14} color={d.color} />
                </View>
                <Text style={[styles.discTitle, { color: colors.foreground }]} numberOfLines={2}>{d.title}</Text>
                <Text style={[styles.discSub, { color: colors.mutedForeground }]} numberOfLines={2}>{d.sub}</Text>
                {d.prizePool ? (
                  <View style={[styles.discPrize, { backgroundColor: d.color + "11" }]}>
                    <Feather name="award" size={11} color={d.color} />
                    <Text style={[styles.discPrizeTxt, { color: d.color }]} numberOfLines={1}>{d.prizePool}</Text>
                  </View>
                ) : null}
                <View style={[styles.discFoot]}>
                  <Text style={[styles.discLink, { color: d.color }]}>{d.ctaLabel}</Text>
                  <Feather name="arrow-right" size={11} color={d.color} />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* News strip */}
      <View style={[styles.section]}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Crypto News</Text>
          <TouchableOpacity><Text style={[styles.seeAll, { color: colors.primary }]}>All →</Text></TouchableOpacity>
        </View>
        <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { t: "Bitcoin holds above $76K as ETF inflows continue", time: "2h ago", src: "Reuters" },
            { t: "RBI clarifies VDA tax: 1% TDS unchanged for FY26", time: "5h ago", src: "ET Markets" },
            { t: "Solana hits new ATH on rising DeFi volume",        time: "8h ago", src: "CoinDesk" },
            { t: "Ethereum Pectra upgrade goes live on mainnet",     time: "1d ago", src: "Bloomberg" },
          ].map((n, i, arr) => (
            <TouchableOpacity key={i} style={[styles.newsRow, { borderBottomColor: colors.border, borderBottomWidth: i === arr.length - 1 ? 0 : StyleSheet.hairlineWidth }]}>
              <View style={[styles.newsBullet, { backgroundColor: colors.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.newsTitle, { color: colors.foreground }]} numberOfLines={2}>{n.t}</Text>
                <Text style={[styles.newsMeta, { color: colors.mutedForeground }]}>{n.src} · {n.time}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Earn promo */}
      <TouchableOpacity onPress={() => goAction("/services/earn", true)}
        style={[styles.earnCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.earnIcon, { backgroundColor: "#0ecb8122" }]}>
          <Feather name="trending-up" size={20} color="#0ecb81" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.earnTitle, { color: colors.foreground }]}>Earn Passive Income</Text>
          <Text style={[styles.earnSub, { color: colors.mutedForeground }]}>Stake USDT @ 8.5% · BTC @ 4.2% · ETH @ 5.1% APY</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>

      {/* Refer promo */}
      <TouchableOpacity onPress={() => goAction("/services/refer", true)}
        style={[styles.earnCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.earnIcon, { backgroundColor: "#a06af522" }]}>
          <Feather name="gift" size={20} color="#a06af5" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.earnTitle, { color: colors.foreground }]}>Refer & Earn 20%</Text>
          <Text style={[styles.earnSub, { color: colors.mutedForeground }]}>Invite friends, earn lifetime trading commission</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerBrand, { color: colors.primary }]}>CryptoX</Text>
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>India's premier crypto exchange · 1% TDS compliant</Text>
        <View style={styles.socialRow}>
          {(["twitter", "globe", "send", "youtube"] as const).map(ic => (
            <TouchableOpacity key={ic} style={[styles.socialBtn, { backgroundColor: colors.card }]}>
              <Feather name={ic} size={13} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, gap: 6 },
  brandRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  brandLogo: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  brandLogoTxt: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#ffffff", lineHeight: 20 },
  brandName: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  greeting: { fontSize: 11, fontFamily: "Inter_400Regular" },
  brand: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 2 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },

  breakdownRow: { flexDirection: "row", alignItems: "stretch", borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingVertical: 10, paddingHorizontal: 4 },
  breakdownItem: { flex: 1, paddingHorizontal: 8, gap: 4 },
  breakdownHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  breakdownDot: { width: 6, height: 6, borderRadius: 3 },
  breakdownLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  breakdownVal: { fontSize: 13, fontFamily: "Inter_700Bold" },
  breakdownSep: { width: StyleSheet.hairlineWidth, marginVertical: 2 },

  ticker: { flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginBottom: 10, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  tickerLive: { flexDirection: "row", alignItems: "center", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, marginRight: 8, gap: 4 },
  tickerDot: { width: 5, height: 5, borderRadius: 3 },
  tickerLiveTxt: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  tickerItem: { flexDirection: "row", alignItems: "center", marginRight: 18, gap: 5 },
  tickerSym: { fontSize: 10, fontFamily: "Inter_500Medium" },
  tickerPrice: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tickerChange: { fontSize: 10, fontFamily: "Inter_500Medium" },

  loginCta: { marginHorizontal: 14, marginTop: 4, padding: 16, borderRadius: 14, flexDirection: "row", alignItems: "center" },
  loginCtaTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  loginCtaSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  loginCtaArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },

  assetCard: { marginHorizontal: 14, marginTop: 4, padding: 16, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  assetTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  assetLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  assetValRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  assetValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  assetSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  pnlBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  pnlTxt: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  kycBar: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 8, marginTop: 12 },
  kycHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  kycText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  kycTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  kycFill: { height: 4 },
  assetActions: { flexDirection: "row", marginTop: 14, gap: 8 },
  assetBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, paddingVertical: 10, borderRadius: 8 },
  assetBtnTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  searchBar: { marginHorizontal: 14, marginTop: 12, paddingHorizontal: 12, height: 38, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", padding: 0, ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}) },

  actionsGrid: { marginHorizontal: 14, marginTop: 12, paddingVertical: 14, borderRadius: 14, flexDirection: "row", flexWrap: "wrap" },
  actionItem: { width: "25%", alignItems: "center", marginBottom: 12 },
  actionIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  actionLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },

  bannerList: { paddingHorizontal: 14, paddingVertical: 10 },
  banner: { width: 280, padding: 14, borderRadius: 12, marginRight: 10, flexDirection: "row", alignItems: "center" },
  bannerTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  bannerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  bannerIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 4, marginBottom: 8 },
  dot: { height: 4, borderRadius: 2 },

  section: { marginTop: 8 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 6 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  seeAll: { fontSize: 12, fontFamily: "Inter_500Medium" },

  tabRow: { flexDirection: "row", marginHorizontal: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  tabItem: { paddingHorizontal: 12, paddingVertical: 10, alignItems: "center" },
  tabTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabUnderline: { position: "absolute", bottom: 0, left: 10, right: 10, height: 2, borderRadius: 2 },
  segmentRow: { position: "relative", flexDirection: "row", marginHorizontal: 14, marginBottom: 10, height: 36, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 2, overflow: "hidden" },
  segmentIndicator: { position: "absolute", top: 2, bottom: 2, left: 2, borderRadius: 8 },
  segmentBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, zIndex: 1 },
  segmentTxt: { fontSize: 12, fontFamily: "Inter_700Bold" },
  quoteRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 14, marginBottom: 8 },
  quotePill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  quotePillTxt: { fontSize: 11, fontFamily: "Inter_700Bold" },
  eligibleCount: { fontSize: 10, fontFamily: "Inter_500Medium" },
  rankBadge: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", marginRight: 6 },
  rankBadgeTxt: { fontSize: 10, fontFamily: "Inter_700Bold" },
  permBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  permBadgeTxt: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },

  listCard: { marginHorizontal: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  coinDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  coinDotTxt: { fontSize: 13, fontFamily: "Inter_700Bold" },
  rowSym: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  rowVol: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  rowPrice: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  changeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 3 },
  changeBadgeTxt: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  empty: { textAlign: "center", padding: 18, fontSize: 12 },

  discCard: { width: 200, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  discTagRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  discTag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
  discTagTxt: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  discTitle: { fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 4 },
  discSub: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  discFoot: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10 },
  discLink: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  discPrize: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, marginTop: 8, alignSelf: "flex-start" },
  discPrizeTxt: { fontSize: 10, fontFamily: "Inter_700Bold" },
  bannerCta: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginTop: 8 },
  bannerCtaTxt: { fontSize: 10, fontFamily: "Inter_700Bold" },

  newsRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  newsBullet: { width: 4, height: 4, borderRadius: 2, marginTop: 7 },
  newsTitle: { fontSize: 12.5, fontFamily: "Inter_500Medium", lineHeight: 17 },
  newsMeta: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 3 },

  earnCard: { marginHorizontal: 14, marginTop: 10, padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 12 },
  earnIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  earnTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  earnSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },

  footer: { alignItems: "center", paddingTop: 28, paddingBottom: 16 },
  footerBrand: { fontSize: 18, fontFamily: "Inter_700Bold" },
  footerText: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  socialRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  socialBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
});
