import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useState } from "react";

interface Props {
  label: string;
  required?: boolean;
  value: string;
  options: string[];
  placeholder?: string;
  onSelect: (v: string) => void;
}

const PRIMARY = "#1a237e";

export default function PickerField({ label, required, value, options, placeholder = "Select…", onSelect }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Text style={styles.label}>
        {label}{required && <Text style={styles.req}> *</Text>}
      </Text>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.75}>
        <Text style={[styles.triggerText, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <Text style={styles.sheetClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView bounces={false}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.option, value === opt && styles.optionActive]}
                onPress={() => { onSelect(opt); setOpen(false); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, value === opt && styles.optionTextActive]}>{opt}</Text>
                {value === opt && <Text style={styles.tick}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 },
  req: { color: "#ef4444" },
  trigger: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1.5, borderColor: "#e5e7eb", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: "#fafafa",
  },
  triggerText: { fontSize: 15, color: "#111827", flex: 1 },
  placeholder: { color: "#9ca3af" },
  chevron: { fontSize: 20, color: "#9ca3af", fontWeight: "300", marginTop: -2 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: "60%", paddingBottom: 32,
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
  },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  sheetClose: { fontSize: 18, color: "#9ca3af", padding: 4 },
  option: { paddingHorizontal: 20, paddingVertical: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionActive: { backgroundColor: "#eef2ff" },
  optionText: { fontSize: 15, color: "#374151" },
  optionTextActive: { color: PRIMARY, fontWeight: "700" },
  tick: { color: PRIMARY, fontWeight: "700", fontSize: 16 },
});
