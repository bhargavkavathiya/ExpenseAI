import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  // Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import type { RootStackParamList } from "../../App";
import { api /*, getToken */ } from "@/api";
import { expand, resetScreen } from "@/glossary";

type Props = NativeStackScreenProps<RootStackParamList, "Result">;

type ModuleResult = { score: number; summary?: string | null; modelVersion?: string };
type PerModule = { ocr: ModuleResult; duplicate: ModuleResult; anomaly: ModuleResult; policy: ModuleResult };
type ExpenseResult = { vendor?: string | null; total?: number | null; currency: string; explanation?: string | null; overallConfidence: number; perModule: PerModule; needsReview: boolean; reviewReason?: string | null };
type DecisionResponse = { refId: string; status: string; overallConfidence?: number | null; needsReview: boolean; reviewReason?: string | null; category?: string | null; claimedAmount?: number | null; result?: ExpenseResult | null };

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  approved:     { color: "#fff", bg: "#16a34a", icon: "✅", label: "Approved" },
  rejected:     { color: "#fff", bg: "#dc2626", icon: "❌", label: "Rejected" },
  needs_review: { color: "#fff", bg: "#d97706", icon: "⚠️", label: "Needs Review" },
  processing:   { color: "#fff", bg: "#6b7280", icon: "⏳", label: "Processing" },
  failed:       { color: "#fff", bg: "#7f1d1d", icon: "💥", label: "Failed" },
};

const MODULE_META: Record<string, { label: string; icon: string }> = {
  ocr:       { label: "Optical Character Recognition (OCR)", icon: "🔍" },
  duplicate: { label: "Duplicate Detection",                 icon: "🔁" },
  anomaly:   { label: "Anomaly Detection",                   icon: "📊" },
  policy:    { label: "Policy Engine",                       icon: "📋" },
};

const CATEGORY_ICONS: Record<string, string> = {
  food: "🍽️", travel: "✈️", accommodation: "🏨", office: "📎",
  entertainment: "🎭", medical: "⚕️", training: "📚", other: "📋",
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "#16a34a" : pct >= 60 ? "#d97706" : "#dc2626";
  return (
    <View style={barStyles.root}>
      <View style={[barStyles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}
const barStyles = StyleSheet.create({
  root: { height: 8, backgroundColor: "#e5e7eb", borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
});

export default function ResultScreen({ route, navigation }: Props) {
  resetScreen("Result");
  const { refId } = route.params;
  const [data, setData] = useState<DecisionResponse | null>(null);
  const [error, setError] = useState(false);
  // const [receiptSrc, setReceiptSrc] = useState<{ uri: string; headers: Record<string, string> } | null>(null);

  useEffect(() => {
    api.get<DecisionResponse>(`/expenses/${refId}`)
      .then((r) => setData(r.data))
      .catch(() => setError(true));
  }, [refId]);

  // useEffect(() => {
  //   (async () => {
  //     const token = await getToken();
  //     const baseURL = api.defaults.baseURL ?? "";
  //     setReceiptSrc({
  //       uri: `${baseURL}/expenses/${refId}/receipt`,
  //       headers: token ? { Authorization: `Bearer ${token}` } : {},
  //     });
  //   })();
  // }, [refId]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>😕</Text>
        <Text style={styles.errorText}>Could not load result.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.replace("Submit")}>
          <Text style={styles.btnText}>Back to Submit</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a237e" />
        <Text style={styles.loadingText}>Loading result…</Text>
      </View>
    );
  }

  const cfg = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.failed;
  const confidence = data.result?.overallConfidence ?? data.overallConfidence ?? 0;
  const r = data.result;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>

      {/* Status Hero */}
      <View style={[styles.heroCard, { backgroundColor: cfg.bg }]}>
        <Text style={styles.heroIcon}>{cfg.icon}</Text>
        <Text style={styles.heroStatus}>{cfg.label}</Text>
        <Text style={styles.heroRef}>{data.refId}</Text>
      </View>

      {/* Receipt Image - hidden on mobile */}
      {/*
      {receiptSrc && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Uploaded Receipt</Text>
          <View style={styles.receiptWrap}>
            <Image source={receiptSrc} style={styles.receiptImg} resizeMode="contain" />
          </View>
        </View>
      )}
      */}

      {/* Confidence */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Confidence Score</Text>
        <View style={styles.confRow}>
          <Text style={styles.confValue}>{Math.round(confidence * 100)}%</Text>
          <Text style={styles.confSub}>
            {confidence >= 0.8 ? "High confidence" : confidence >= 0.6 ? "Moderate confidence" : "Low confidence — routed for review"}
          </Text>
        </View>
        <ConfidenceBar value={confidence} />
      </View>

      {/* Needs Review Banner */}
      {data.needsReview && (
        <View style={styles.reviewBanner}>
          <Text style={styles.reviewIcon}>👁️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewTitle}>Routed to Analyst</Text>
            <Text style={styles.reviewSub}>{data.reviewReason ?? "Confidence below threshold."}</Text>
          </View>
        </View>
      )}

      {/* Extracted Details */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Extracted Details</Text>
        <Row label="Vendor" value={r?.vendor ?? "—"} />
        <Row label="Amount" value={r?.total != null ? `${r.currency ?? "INR"} ${r.total.toFixed(2)}` : "—"} highlight />
        {data.category && <Row label="Category" value={`${CATEGORY_ICONS[data.category] ?? "📋"}  ${data.category}`} />}
        {data.claimedAmount != null && <Row label="Claimed" value={`INR ${data.claimedAmount.toFixed(2)}`} />}
      </View>

      {/* Explanation */}
      {r?.explanation && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>
            {expand("AI", "Result")} Audit Explanation
          </Text>
          <Text style={styles.explanationText}>{r.explanation}</Text>
        </View>
      )}

      {/* Module Breakdown */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Module Breakdown</Text>
        {r?.perModule
          ? (Object.entries(r.perModule) as [string, ModuleResult][]).map(([key, mod]) => {
              const meta = MODULE_META[key] ?? { label: key, icon: "⚙️" };
              const pct = Math.round(mod.score * 100);
              const scoreColor = pct >= 80 ? "#16a34a" : pct >= 60 ? "#d97706" : "#dc2626";
              return (
                <View key={key} style={styles.moduleRow}>
                  <Text style={styles.moduleIcon}>{meta.icon}</Text>
                  <View style={styles.moduleCenter}>
                    <Text style={styles.moduleLabel}>{meta.label}</Text>
                    {mod.summary ? <Text style={styles.moduleSummary}>{mod.summary}</Text> : null}
                    <ConfidenceBar value={mod.score} />
                  </View>
                  <Text style={[styles.moduleScore, { color: scoreColor }]}>{pct}%</Text>
                </View>
              );
            })
          : <Text style={styles.explanationText}>Module data unavailable.</Text>}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.replace("Submit")} activeOpacity={0.85}>
          <Text style={styles.btnText}>+ New Expense</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnOutline} onPress={() => navigation.navigate("MyExpenses")} activeOpacity={0.85}>
          <Text style={styles.btnOutlineText}>My Expenses</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, highlight && rowStyles.highlight]}>{value}</Text>
    </View>
  );
}
const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  label: { fontSize: 13, color: "#6b7280" },
  value: { fontSize: 13, fontWeight: "600", color: "#111827", maxWidth: "60%", textAlign: "right" },
  highlight: { fontSize: 15, fontWeight: "800", color: "#1a237e" },
});

const PRIMARY = "#1a237e";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1f3f9" },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, backgroundColor: "#f1f3f9" },
  errorIcon: { fontSize: 48 },
  errorText: { fontSize: 16, color: "#dc2626", fontWeight: "600" },
  loadingText: { fontSize: 14, color: "#6b7280" },

  heroCard: { borderRadius: 20, padding: 28, alignItems: "center", gap: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  heroIcon: { fontSize: 44 },
  heroStatus: { fontSize: 22, fontWeight: "800", color: "#fff" },
  heroRef: { fontSize: 12, color: "rgba(255,255,255,0.75)", fontFamily: "monospace" },

  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 },

  receiptWrap: { borderRadius: 12, overflow: "hidden", backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e5e7eb" },
  receiptImg:  { width: "100%", height: 320, backgroundColor: "#f8fafc" },

  confRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  confValue: { fontSize: 36, fontWeight: "800", color: PRIMARY },
  confSub: { fontSize: 12, color: "#6b7280", flex: 1 },

  reviewBanner: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: "#fef3c7", borderRadius: 14, padding: 14, borderLeftWidth: 4, borderLeftColor: "#f59e0b" },
  reviewIcon: { fontSize: 22 },
  reviewTitle: { fontSize: 14, fontWeight: "700", color: "#92400e" },
  reviewSub: { fontSize: 12, color: "#b45309", marginTop: 2 },

  explanationText: { fontSize: 13, color: "#374151", lineHeight: 20 },

  moduleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f8fafc" },
  moduleIcon: { fontSize: 20, width: 28, textAlign: "center", marginTop: 1 },
  moduleCenter: { flex: 1, gap: 4 },
  moduleLabel: { fontSize: 13, fontWeight: "600", color: "#1f2937" },
  moduleSummary: { fontSize: 11, color: "#6b7280" },
  moduleScore: { fontSize: 16, fontWeight: "800", minWidth: 44, textAlign: "right", marginTop: 2 },

  actions: { flexDirection: "row", gap: 12, marginTop: 4 },
  btn: { flex: 1, backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 14, alignItems: "center", shadowColor: PRIMARY, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  btnOutline: { flex: 1, borderWidth: 2, borderColor: PRIMARY, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnOutlineText: { color: PRIMARY, fontSize: 14, fontWeight: "700" },
});
