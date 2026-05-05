import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import type { RootStackParamList } from "../../App";
import { api } from "@/api";
import { expand, resetScreen } from "@/glossary";

type Props = NativeStackScreenProps<RootStackParamList, "Ack">;

const STEPS = [
  { icon: "🔍", label: `Optical Character Recognition (OCR) extraction` },
  { icon: "🔁", label: "Duplicate detection" },
  { icon: "📊", label: "Anomaly detection" },
  { icon: "📋", label: "Policy rule evaluation" },
];

export default function AckScreen({ route, navigation }: Props) {
  resetScreen("Ack");
  const { refId } = route.params;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/expenses/${refId}`);
        if (data.status && data.status !== "processing") {
          if (timer.current) clearInterval(timer.current);
          navigation.replace("Result", { refId });
        }
      } catch { /* keep polling on transient errors */ }
    }, 1500);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [navigation, refId]);

  return (
    <View style={styles.root}>
      <View style={styles.iconBox}>
        <Text style={styles.iconText}>⏳</Text>
      </View>
      <Text style={styles.title}>Processing Expense</Text>
      <View style={styles.refBox}>
        <Text style={styles.refLabel}>Reference</Text>
        <Text style={styles.refId}>{refId}</Text>
      </View>
      <Text style={styles.sub}>
        Running {expand("AI", "Ack")} pipeline — usually under 5 seconds
      </Text>

      <View style={styles.stepsCard}>
        {STEPS.map((s, i) => (
          <View key={i} style={styles.stepRow}>
            <Text style={styles.stepIcon}>{s.icon}</Text>
            <Text style={styles.stepLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <ActivityIndicator size="large" color="#1a237e" style={{ marginTop: 8 }} />
      <Text style={styles.wait}>Please wait…</Text>
    </View>
  );
}

const PRIMARY = "#1a237e";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1f3f9", alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },

  iconBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  iconText: { fontSize: 38 },

  title: { fontSize: 22, fontWeight: "800", color: PRIMARY },
  refBox: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, alignItems: "center", gap: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  refLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 },
  refId: { fontSize: 14, fontFamily: "monospace", fontWeight: "700", color: PRIMARY },
  sub: { fontSize: 13, color: "#64748b", textAlign: "center" },

  stepsCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, width: "100%", gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepIcon: { fontSize: 18, width: 28, textAlign: "center" },
  stepLabel: { fontSize: 13, color: "#374151", flex: 1 },

  wait: { fontSize: 12, color: "#9ca3af" },
});
