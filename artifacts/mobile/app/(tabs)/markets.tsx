import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { usePrices, PriceTick } from "@/hooks/usePrices";
import { CoinRow } from "@/components/CoinRow";
import { EmptyState } from "@/components/EmptyState";

type Filter = "all" | "gainers" | "losers";

export default function MarketsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ticks } = usePrices();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    let list = ticks.filter((t) => t.usdt > 0 && t.symbol !== "USDT" && t.symbol !== "INR");
    if (filter === "gainers") list = list.filter((t) => t.change24h > 0).sort((a, b) => b.change24h - a.change24h);
    else if (filter === "losers") list = list.filter((t) => t.change24h < 0).sort((a, b) => a.change24h - b.change24h);
    else list = list.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter((t) => t.symbol.toUpperCase().includes(q));
    }
    return list;
  }, [ticks, filter, search]);

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "gainers", label: "Gainers" },
    { key: "losers", label: "Losers" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Markets</Text>
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search coins..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterBtn,
                { borderColor: colors.border },
                filter === f.key && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterLabel, { color: filter === f.key ? "#fff" : colors.mutedForeground }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(t) => t.symbol}
        contentContainerStyle={{ paddingBottom: botPt + 80, flexGrow: 1 }}
        scrollEnabled={!!filtered.length}
        renderItem={({ item: t }) => (
          <CoinRow
            symbol={t.symbol}
            price={t.usdt}
            change24h={t.change24h}
            volume={t.volume24h * t.usdt}
            onPress={() => router.push(`/trade/${t.symbol}USDT` as any)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="bar-chart-2"
            title={search ? "No coins found" : "Loading markets..."}
            subtitle={search ? "Try a different symbol" : "Connecting to live prices"}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  title: { fontSize: 22, fontWeight: "800", paddingTop: 12 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  filterRow: { flexDirection: "row", gap: 8 },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterLabel: { fontSize: 13, fontWeight: "600" },
});
