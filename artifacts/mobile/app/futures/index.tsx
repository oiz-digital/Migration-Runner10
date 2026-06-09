import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { usePrices } from "@/hooks/usePrices";
import { PriceChange } from "@/components/PriceChange";

const FUTURES_COINS = ["BTC", "ETH", "SOL", "BNB", "XRP", "MATIC", "AVAX", "ADA", "DOT", "LINK", "DOGE", "NEAR"];
const COIN_COLORS: Record<string, string> = {
  BTC: "#f7931a", ETH: "#627eea", BNB: "#f3ba2f", XRP: "#346aa9",
  SOL: "#9945ff", ADA: "#3cc8c8", MATIC: "#8247e5", AVAX: "#e84142",
  DOT: "#e6007a", LINK: "#2a5ada", DOGE: "#c2a633", NEAR: "#00c08b",
  DEFAULT: "#6b7a9e",
};

export default function FuturesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ticks } = usePrices();

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const futuresPairs = useMemo(() => {
    return FUTURES_COINS
      .map((sym) => ticks.find((t) => t.symbol === sym))
      .filter(Boolean) as typeof ticks;
  }, [ticks]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Futures</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Info banner */}
      <View style={[styles.infoBanner, { backgroundColor: colors.warning + "15", borderColor: colors.warning + "40" }]}>
        <Feather name="alert-triangle" size={16} color={colors.warning} />
        <Text style={[styles.infoText, { color: colors.warning }]}>
          Futures trading carries high risk. Trade responsibly.
        </Text>
      </View>

      {/* Column headers */}
      <View style={[styles.colHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 1.5 }]}>Symbol</Text>
        <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 1, textAlign: "right" }]}>Price</Text>
        <Text style={[styles.colLabel, { color: colors.mutedForeground, flex: 1, textAlign: "right" }]}>24h</Text>
        <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 60, textAlign: "center" }]}>Trade</Text>
      </View>

      <FlatList
        data={futuresPairs}
        keyExtractor={(t) => t.symbol}
        contentContainerStyle={{ paddingBottom: botPt + 20 }}
        renderItem={({ item: t }) => {
          const bg = COIN_COLORS[t.symbol] ?? COIN_COLORS.DEFAULT;
          const price = t.usdt;
          const priceStr = price < 0.001
            ? price.toFixed(6)
            : price < 1
              ? price.toFixed(4)
              : price.toLocaleString("en-US", { maximumFractionDigits: 2 });
          return (
            <TouchableOpacity
              style={[styles.pairRow, { borderBottomColor: colors.border }]}
              onPress={() => router.push(`/trade/${t.symbol}USDT` as any)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1.5, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={[styles.coinIcon, { backgroundColor: bg + "22" }]}>
                  <Text style={[styles.coinLetter, { color: bg }]}>{t.symbol.charAt(0)}</Text>
                </View>
                <View>
                  <Text style={[styles.pairName, { color: colors.foreground }]}>{t.symbol}/USDT</Text>
                  <Text style={[styles.leverage, { color: colors.primary }]}>Up to 50x</Text>
                </View>
              </View>
              <Text style={[styles.pairPrice, { color: colors.foreground, flex: 1, textAlign: "right" }]}>
                ${priceStr}
              </Text>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <PriceChange value={t.change24h} />
              </View>
              <TouchableOpacity
                style={[styles.tradeBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push(`/trade/${t.symbol}USDT` as any)}
              >
                <Text style={styles.tradeBtnLabel}>Trade</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  infoText: { fontSize: 12, flex: 1, lineHeight: 16 },
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  colLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
  pairRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  coinIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  coinLetter: { fontSize: 14, fontWeight: "700" },
  pairName: { fontSize: 14, fontWeight: "600" },
  leverage: { fontSize: 11, marginTop: 2 },
  pairPrice: { fontSize: 14, fontWeight: "600" },
  tradeBtn: { width: 52, paddingVertical: 6, borderRadius: 6, alignItems: "center" },
  tradeBtnLabel: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
