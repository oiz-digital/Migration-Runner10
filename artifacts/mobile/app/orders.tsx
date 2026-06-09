import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";

interface Order {
  id: number;
  pair: string;
  side: "buy" | "sell";
  type: "limit" | "market" | "stop";
  amount: number;
  filled: number;
  price?: number;
  average?: number;
  status: "open" | "filled" | "cancelled" | "partial";
  createdAt: string;
}

type Tab = "open" | "filled" | "cancelled";

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("open");

  const topPt = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPt = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["orders", tab],
    queryFn: () => apiFetch<Order[]>(`/api/exchange/order?status=${tab}`),
    enabled: isAuthenticated,
  });

  const statusColors: Record<string, string> = {
    open: colors.primary,
    filled: colors.success,
    cancelled: colors.mutedForeground,
    partial: colors.warning,
  };

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Orders</Text>
          <View style={styles.backBtn} />
        </View>
        <EmptyState icon="lock" title="Login required" subtitle="Sign in to view your orders" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPt, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Orders</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["open", "filled", "cancelled"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={orders ?? []}
          keyExtractor={(o) => o.id.toString()}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: botPt + 20, flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} tintColor={colors.primary} />
          }
          renderItem={({ item: o }) => {
            const fillPct = o.amount > 0 ? (o.filled / o.amount) * 100 : 0;
            return (
              <View style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.orderTop}>
                  <View style={styles.orderLeft}>
                    <View style={styles.orderTitleRow}>
                      <Text style={[styles.orderPair, { color: colors.foreground }]}>{o.pair}</Text>
                      <View style={[styles.orderTypeBadge, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.orderTypeText, { color: colors.mutedForeground }]}>{o.type.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={[styles.orderDate, { color: colors.mutedForeground }]}>
                      {new Date(o.createdAt).toLocaleString("en-IN")}
                    </Text>
                  </View>
                  <View style={styles.orderRight}>
                    <Text style={[styles.orderSide, { color: o.side === "buy" ? colors.success : colors.destructive }]}>
                      {o.side.toUpperCase()}
                    </Text>
                    <View style={[styles.statusDot, { backgroundColor: statusColors[o.status] ?? colors.mutedForeground }]} />
                    <Text style={[styles.orderStatus, { color: statusColors[o.status] ?? colors.mutedForeground }]}>
                      {o.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={[styles.orderDivider, { backgroundColor: colors.border }]} />
                <View style={styles.orderDetails}>
                  <View style={styles.orderDetail}>
                    <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Amount</Text>
                    <Text style={[styles.detailValue, { color: colors.foreground }]}>{o.amount.toFixed(4)}</Text>
                  </View>
                  <View style={styles.orderDetail}>
                    <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Price</Text>
                    <Text style={[styles.detailValue, { color: colors.foreground }]}>
                      {o.price ? `$${o.price.toFixed(2)}` : "Market"}
                    </Text>
                  </View>
                  <View style={styles.orderDetail}>
                    <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Filled</Text>
                    <Text style={[styles.detailValue, { color: colors.foreground }]}>{fillPct.toFixed(1)}%</Text>
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="list"
              title={`No ${tab} orders`}
              subtitle={tab === "open" ? "Your open orders will appear here" : "Order history will appear here"}
            />
          }
        />
      )}
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
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 14, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  orderCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 14 },
  orderLeft: { flex: 1 },
  orderTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderPair: { fontSize: 15, fontWeight: "700" },
  orderTypeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  orderTypeText: { fontSize: 10, fontWeight: "700" },
  orderDate: { fontSize: 12, marginTop: 4 },
  orderRight: { alignItems: "flex-end", gap: 4 },
  orderSide: { fontSize: 14, fontWeight: "700" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  orderStatus: { fontSize: 11, fontWeight: "600" },
  orderDivider: { height: StyleSheet.hairlineWidth },
  orderDetails: { flexDirection: "row", padding: 12, gap: 8 },
  orderDetail: { flex: 1 },
  detailLabel: { fontSize: 11, fontWeight: "600" },
  detailValue: { fontSize: 13, fontWeight: "600", marginTop: 2 },
});
