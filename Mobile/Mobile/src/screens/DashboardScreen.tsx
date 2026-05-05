import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import type { RootStackParamList } from "../../App";
import { api, loadUserProfile } from "@/api";
import { resetScreen } from "@/glossary";

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

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
  meals: "🍽️", food: "🍽️",
  travel: "✈️",
  hotel: "🏨", accommodation: "🏨",
  office: "📎", "office supplies": "📎",
  entertainment: "🎭",
  medical: "⚕️",
  training: "📚",
  fuel: "⛽",
  other: "📋",
};

function formatCurrency(val: number) {
  return `₹ ${val.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DashboardScreen({ navigation }: Props) {
  resetScreen("Dashboard");

  const [items,      setItems]      = useState<ExpenseSummary[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName,   setUserName]   = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [{ data }, profile] = await Promise.all([
        api.get<ExpenseSummary[]>("/expenses/recent?limit=50"),
        loadUserProfile(),
      ]);
      setItems(data);
      const name = profile?.profile?.fullName ?? profile?.email ?? "";
      setUserName(name.includes("@") ? name.split("@")[0] : name.split(" ")[0]);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Computed stats ──────────────────────────────────────────────────────────
  const approved   = items.filter(i => i.status === "approved");
  const rejected   = items.filter(i => i.status === "rejected");
  const reviewing  = items.filter(i => i.status === "needs_review");
  const processing = items.filter(i => i.status === "processing");

  const sum = (arr: ExpenseSummary[]) =>
    arr.reduce((s, i) => s + (i.claimedAmount ?? i.total ?? 0), 0);

  const totalClaimed   = sum(items);
  const approvedAmount = sum(approved);
  const rejectedAmount = sum(rejected);
  const pendingAmount  = sum([...reviewing, ...processing]);

  const catMap: Record<string, number> = {};
  items.forEach(i => {
    if (i.category) {
      const k = i.category.toLowerCase();
      catMap[k] = (catMap[k] ?? 0) + 1;
    }
  });
  const topCategories = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const recent = items.slice(0, 4);

  if (loading) {
    return (
      <View style={S.center}>
        <ActivityIndicator size="large" color="#1a237e" />
        <Text style={S.loadingText}>Loading dashboard…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#1a237e" />}
    >
      {/* ── Header ── */}
      <View style={S.header}>
        <View>
          <Text style={S.greeting}>Hello{userName ? `, ${userName}` : ""} 👋</Text>
          <Text style={S.subGreeting}>Here's your expense summary</Text>
        </View>
        <TouchableOpacity
          style={S.profileBtn}
          onPress={() => navigation.navigate("Profile")}
          activeOpacity={0.75}
        >
          <Text style={S.profileBtnText}>{userName ? userName.charAt(0).toUpperCase() : "👤"}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Hero Card — total claimed with split bar ── */}
      <View style={S.heroCard}>
        <Text style={S.heroLabel}>Total Claimed</Text>
        <Text style={S.heroAmount}>{formatCurrency(totalClaimed)}</Text>
        <Text style={S.heroSub}>{items.length} submission{items.length !== 1 ? "s" : ""}</Text>

        <View style={S.heroBar}>
          {totalClaimed > 0 && approvedAmount > 0 && (
            <View style={[S.heroBarSegment, { flex: approvedAmount / totalClaimed, backgroundColor: "#4ade80" }]} />
          )}
          {totalClaimed > 0 && rejectedAmount > 0 && (
            <View style={[S.heroBarSegment, { flex: rejectedAmount / totalClaimed, backgroundColor: "#f87171" }]} />
          )}
          {totalClaimed > 0 && pendingAmount > 0 && (
            <View style={[S.heroBarSegment, { flex: pendingAmount / totalClaimed, backgroundColor: "rgba(255,255,255,0.25)" }]} />
          )}
        </View>

        <View style={S.heroLegend}>
          <LegendItem color="#4ade80" label="Approved" />
          <LegendItem color="#f87171" label="Rejected" />
          <LegendItem color="rgba(255,255,255,0.4)" label="Pending" />
        </View>
      </View>

      {/* ── 4 Stat Cards ── */}
      <View style={S.statsRow}>
        <StatCard icon="📊" label="Submitted" count={items.length}      color="#1a237e" bg="#eef2ff" />
        <StatCard icon="✅" label="Approved"  count={approved.length}   color="#16a34a" bg="#dcfce7" />
        <StatCard icon="❌" label="Rejected"  count={rejected.length}   color="#dc2626" bg="#fee2e2" />
        <StatCard icon="⚠️" label="Review"   count={reviewing.length}  color="#d97706" bg="#fef3c7" />
      </View>

      {/* ── Amount Breakdown ── */}
      <View style={S.card}>
        <Text style={S.cardTitle}>Amount Breakdown</Text>
        <AmountRow label="Approved"      amount={approvedAmount} color="#16a34a" />
        <AmountRow label="Rejected"      amount={rejectedAmount} color="#dc2626" />
        <AmountRow label="Pending Review" amount={pendingAmount}  color="#d97706" />
        <View style={S.divider} />
        <AmountRow label="Total Claimed" amount={totalClaimed}   color="#1a237e" bold />
      </View>

      {/* ── Top Categories ── */}
      <View style={S.card}>
        <Text style={S.cardTitle}>Top Categories</Text>
        {topCategories.length === 0 ? (
          <Text style={S.noDataText}>No category data yet</Text>
        ) : (
          topCategories.map(([cat, count]) => (
            <View key={cat} style={S.catRow}>
              <Text style={S.catIcon}>{CATEGORY_ICONS[cat] ?? "📋"}</Text>
              <Text style={S.catName}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
              <View style={S.catBarWrap}>
                <View style={[S.catBarFill, { width: `${Math.round((count / items.length) * 100)}%` as any }]} />
              </View>
              <Text style={S.catCount}>{count}</Text>
            </View>
          ))
        )}
      </View>

      {/* ── Recent Expenses ── */}
      <View style={S.card}>
        <View style={S.cardTitleRow}>
          <Text style={S.cardTitle}>Recent Expenses</Text>
          {recent.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate("MyExpenses")}>
              <Text style={S.viewAll}>View all →</Text>
            </TouchableOpacity>
          )}
        </View>
        {recent.length === 0 ? (
          <View style={S.noRecords}>
            <Text style={S.noRecordsIcon}>🧾</Text>
            <Text style={S.noRecordsText}>No expenses submitted yet</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Submit")}>
              <Text style={S.noRecordsLink}>Submit your first receipt →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          recent.map((item, idx) => {
            const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.failed;
            const amount = item.claimedAmount ?? item.total;
            return (
              <TouchableOpacity
                key={item.refId}
                style={[S.recentRow, idx === recent.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => navigation.navigate("Result", { refId: item.refId })}
                activeOpacity={0.7}
              >
                <View style={[S.recentIcon, { backgroundColor: cfg.bg }]}>
                  <Text style={{ fontSize: 16 }}>{cfg.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.recentVendor} numberOfLines={1}>{item.vendor ?? "Unknown vendor"}</Text>
                  <Text style={S.recentDate}>{formatDate(item.submittedAt)}</Text>
                </View>
                <Text style={[S.recentAmount, { color: cfg.text }]}>
                  {amount != null ? formatCurrency(amount) : "—"}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* ── Action Buttons ── */}
      <View style={S.actions}>
        <TouchableOpacity style={S.primaryBtn} onPress={() => navigation.navigate("Submit")} activeOpacity={0.85}>
          <Text style={S.primaryBtnText}>＋  New Expense</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.outlineBtn} onPress={() => navigation.navigate("MyExpenses")} activeOpacity={0.85}>
          <Text style={S.outlineBtnText}>📋  All Expenses</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, count, color, bg }: { icon: string; label: string; count: number; color: string; bg: string }) {
  return (
    <View style={[S.statCard, { backgroundColor: bg }]}>
      <Text style={S.statIcon}>{icon}</Text>
      <Text style={[S.statCount, { color }]}>{count}</Text>
      <Text style={[S.statLabel, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
    </View>
  );
}

function AmountRow({ label, amount, color, bold }: { label: string; amount: number; color: string; bold?: boolean }) {
  return (
    <View style={S.amountRow}>
      <Text style={[S.amountLabel, bold && S.amountLabelBold]}>{label}</Text>
      <Text style={[S.amountValue, { color }, bold && S.amountValueBold]}>{formatCurrency(amount)}</Text>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={S.legendItem}>
      <View style={[S.legendDot, { backgroundColor: color }]} />
      <Text style={S.legendText}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PRIMARY = "#1a237e";

const S = StyleSheet.create({
  root:        { flex: 1, backgroundColor: "#f1f3f9" },
  content:     { padding: 16, gap: 14, paddingBottom: 48 },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#f1f3f9", padding: 32 },
  loadingText: { fontSize: 14, color: "#6b7280" },

  header:      { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  greeting:    { fontSize: 22, fontWeight: "800", color: PRIMARY },
  subGreeting: { fontSize: 12, color: "#64748b", marginTop: 2 },
  signOut:     { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb" },
  signOutText: { fontSize: 12, color: "#6b7280", fontWeight: "600" },
  profileBtn:     {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: PRIMARY,
    alignItems: "center", justifyContent: "center",
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  profileBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  heroCard: {
    backgroundColor: PRIMARY,
    borderRadius: 20, padding: 22, gap: 4,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6,
  },
  heroLabel:      { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1 },
  heroAmount:     { fontSize: 36, fontWeight: "800", color: "#fff" },
  heroSub:        { fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 10 },
  heroBar:        { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.12)" },
  heroBarSegment: { height: "100%" },
  heroLegend:     { flexDirection: "row", gap: 16, marginTop: 8 },
  legendItem:     { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot:      { width: 8, height: 8, borderRadius: 4 },
  legendText:     { fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: "600" },

  statsRow: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, alignItems: "center", gap: 2 },
  statIcon:  { fontSize: 18 },
  statCount: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.2 },

  card: {
    backgroundColor: "#fff", borderRadius: 18, padding: 16, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle:    { fontSize: 11, fontWeight: "800", color: "#374151", textTransform: "uppercase", letterSpacing: 0.8 },
  viewAll:      { fontSize: 12, color: PRIMARY, fontWeight: "700" },

  amountRow:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  amountLabel:     { fontSize: 13, color: "#6b7280" },
  amountLabelBold: { fontWeight: "700", color: "#111827" },
  amountValue:     { fontSize: 14, fontWeight: "700" },
  amountValueBold: { fontSize: 16, fontWeight: "800" },
  divider:         { height: 1, backgroundColor: "#f1f5f9", marginVertical: 2 },

  catRow:    { flexDirection: "row", alignItems: "center", gap: 10 },
  catIcon:   { fontSize: 16, width: 24, textAlign: "center" },
  catName:   { fontSize: 13, color: "#374151", fontWeight: "600", width: 100 },
  catBarWrap:{ flex: 1, height: 6, backgroundColor: "#f1f5f9", borderRadius: 3, overflow: "hidden" },
  catBarFill:{ height: "100%", backgroundColor: PRIMARY, borderRadius: 3 },
  catCount:  { fontSize: 13, fontWeight: "700", color: PRIMARY, minWidth: 22, textAlign: "right" },

  recentRow:    { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f8fafc" },
  recentIcon:   { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  recentVendor: { fontSize: 13, fontWeight: "600", color: "#111827" },
  recentDate:   { fontSize: 11, color: "#9ca3af", marginTop: 1 },
  recentAmount: { fontSize: 14, fontWeight: "800" },

  actions:        { flexDirection: "row", gap: 12, marginTop: 4 },
  primaryBtn:     {
    flex: 1, backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 15, alignItems: "center",
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  outlineBtn:     { flex: 1, borderWidth: 2, borderColor: PRIMARY, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  outlineBtnText: { color: PRIMARY, fontSize: 15, fontWeight: "700" },

  noRecords:     { alignItems: "center", paddingVertical: 20, gap: 6 },
  noRecordsIcon: { fontSize: 32 },
  noRecordsText: { fontSize: 13, color: "#9ca3af", fontWeight: "600" },
  noRecordsLink: { fontSize: 13, color: PRIMARY, fontWeight: "700", marginTop: 2 },
  noDataText:    { fontSize: 13, color: "#9ca3af", paddingVertical: 4 },
});
