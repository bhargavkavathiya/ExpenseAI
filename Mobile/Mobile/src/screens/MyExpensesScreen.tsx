import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import type { RootStackParamList } from "../../App";
import { api } from "@/api";
import { resetScreen } from "@/glossary";

type Props = NativeStackScreenProps<RootStackParamList, "MyExpenses">;

type ExpenseSummary = {
  refId: string;
  status: string;
  submittedAt: string;
  overallConfidence?: number | null;
  vendor?: string | null;
  total?: number | null;
  currency: string;
  category?: string | null;
  claimedAmount?: number | null;
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; icon: string }> = {
  approved:     { bg: "#dcfce7", text: "#16a34a", icon: "✅" },
  rejected:     { bg: "#fee2e2", text: "#dc2626", icon: "❌" },
  needs_review: { bg: "#fef3c7", text: "#d97706", icon: "⚠️" },
  processing:   { bg: "#f3f4f6", text: "#6b7280", icon: "⏳" },
  failed:       { bg: "#fee2e2", text: "#7f1d1d", icon: "💥" },
};

const CATEGORY_ICONS: Record<string, string> = {
  food: "🍽️", travel: "✈️", accommodation: "🏨", office: "📎",
  entertainment: "🎭", medical: "⚕️", training: "📚", other: "📋",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type FilterKey = "all" | "approved" | "rejected" | "pending";

const FILTERS: { key: FilterKey; label: string; color: string; bgSoft: string; borderSoft: string }[] = [
  { key: "all",      label: "All",      color: "#1a237e", bgSoft: "#eef2ff", borderSoft: "#c7d2fe" },
  { key: "approved", label: "Approved", color: "#16a34a", bgSoft: "#dcfce7", borderSoft: "#86efac" },
  { key: "rejected", label: "Rejected", color: "#dc2626", bgSoft: "#fee2e2", borderSoft: "#fca5a5" },
  { key: "pending",  label: "Pending",  color: "#d97706", bgSoft: "#fef3c7", borderSoft: "#fcd34d" },
];

function matchesFilter(item: ExpenseSummary, filter: FilterKey) {
  if (filter === "all")      return true;
  if (filter === "approved") return item.status === "approved";
  if (filter === "rejected") return item.status === "rejected";
  if (filter === "pending")  return item.status === "needs_review" || item.status === "processing";
  return true;
}

export default function MyExpensesScreen({ navigation }: Props) {
  resetScreen("MyExpenses");
  const [items, setItems] = useState<ExpenseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      const { data } = await api.get<ExpenseSummary[]>("/expenses/recent?limit=50");
      setItems(data);
    } catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#1a237e" />
      <Text style={styles.loadingText}>Loading expenses…</Text>
    </View>
  );

  if (error) return (
    <View style={styles.center}>
      <Text style={styles.errorIcon}>😕</Text>
      <Text style={styles.errorText}>Failed to load expenses.</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const filtered = items.filter(i => matchesFilter(i, filter));

  return (
    <View style={styles.root}>
      {items.length > 0 && (
        <View style={styles.filterBar}>
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.chip,
                  { borderColor: active ? f.color : f.borderSoft, backgroundColor: active ? f.color : f.bgSoft },
                  active && { shadowColor: f.color, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5 },
                ]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipLabel, { color: active ? "#fff" : f.color }]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.refId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#1a237e" />}
        ListHeaderComponent={
          filtered.length > 0 ? (
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderText}>
                {filtered.length} {filter === "all" ? "expense" : filter}{filtered.length !== 1 ? "s" : ""}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🧾</Text>
              <Text style={styles.emptyTitle}>No expenses yet</Text>
              <Text style={styles.emptyText}>Submit your first receipt to get started.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate("Submit")}>
                <Text style={styles.emptyBtnText}>Submit Receipt</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>No {filter} expenses</Text>
              <Text style={styles.emptyText}>Try a different filter to see more results.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setFilter("all")}>
                <Text style={styles.emptyBtnText}>Show all</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item }) => {
          const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.failed;
          const catIcon = item.category ? (CATEGORY_ICONS[item.category] ?? "📋") : null;
          return (
            <TouchableOpacity style={styles.card} onPress={() => navigation.navigate("Result", { refId: item.refId })} activeOpacity={0.75}>
              <View style={styles.cardTop}>
                <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={styles.statusIcon}>{cfg.icon}</Text>
                  <Text style={[styles.statusText, { color: cfg.text }]}>
                    {item.status.replace(/_/g, " ").toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.dateText}>{formatDate(item.submittedAt)}</Text>
              </View>

              <View style={styles.cardMid}>
                <Text style={styles.vendorText} numberOfLines={1}>
                  {catIcon ? `${catIcon}  ` : ""}{item.vendor ?? "Unknown vendor"}
                </Text>
                {(item.total != null || item.claimedAmount != null) && (
                  <Text style={styles.amountText}>
                    ₹ {(item.total ?? item.claimedAmount ?? 0).toFixed(2)}
                  </Text>
                )}
              </View>

              <View style={styles.cardBot}>
                <Text style={styles.refText}>{item.refId}</Text>
                {item.overallConfidence != null && (
                  <View style={styles.confPill}>
                    <Text style={styles.confPillText}>
                      {Math.round(item.overallConfidence * 100)}% confidence
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.listContent}
      />

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("Submit")} activeOpacity={0.85}>
        <Text style={styles.fabText}>＋  New Expense</Text>
      </TouchableOpacity>
    </View>
  );
}

const PRIMARY = "#1a237e";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1f3f9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#f1f3f9" },
  loadingText: { fontSize: 14, color: "#6b7280" },
  errorIcon: { fontSize: 40 },
  errorText: { fontSize: 15, color: "#dc2626", fontWeight: "600" },
  retryBtn: { backgroundColor: PRIMARY, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 11 },
  retryText: { color: "#fff", fontWeight: "700" },

  listContent: { padding: 14, gap: 10, paddingBottom: 100 },
  emptyContainer: { flex: 1 },
  listHeader: { paddingBottom: 4 },
  listHeaderText: { fontSize: 12, color: "#9ca3af", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 40 },
  emptyIcon: { fontSize: 52 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#374151" },
  emptyText: { fontSize: 14, color: "#9ca3af", textAlign: "center" },
  emptyBtn: { backgroundColor: PRIMARY, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 13, marginTop: 6 },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  card: { backgroundColor: "#fff", borderRadius: 16, padding: 14, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusIcon: { fontSize: 11 },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  dateText: { fontSize: 12, color: "#9ca3af" },

  cardMid: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  vendorText: { fontSize: 15, fontWeight: "700", color: "#111827", flex: 1 },
  amountText: { fontSize: 16, fontWeight: "800", color: PRIMARY },

  cardBot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  refText: { fontSize: 11, color: "#9ca3af", fontFamily: "monospace" },
  confPill: { backgroundColor: "#eef2ff", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  confPillText: { fontSize: 11, color: PRIMARY, fontWeight: "700" },

  fab: { position: "absolute", bottom: 24, right: 20, backgroundColor: PRIMARY, borderRadius: 28, paddingHorizontal: 22, paddingVertical: 14, flexDirection: "row", alignItems: "center", shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  filterBar: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6,
    backgroundColor: "#f1f3f9",
  },
  chip: {
    flex: 1,
    alignItems: "center", justifyContent: "center",
    paddingVertical: 10, paddingHorizontal: 8,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  chipLabel: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
});
