import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";

const ITEM_H = 48;
const VISIBLE = 5; // must be odd
const PAD = Math.floor(VISIBLE / 2);
const { width } = Dimensions.get("window");
const PRIMARY = "#1a237e";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function daysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

function range(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function formatDisplay(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2,"0")} ${MONTHS[m - 1]} ${y}`;
}

/* ── Single wheel column ── */
function Wheel({
  items,
  selected,
  onSelect,
}: {
  items: (string | number)[];
  selected: string | number;
  onSelect: (v: string | number) => void;
}) {
  const listRef = useRef<FlatList>(null);
  const idx = items.indexOf(selected);

  useEffect(() => {
    if (idx >= 0) {
      listRef.current?.scrollToOffset({ offset: idx * ITEM_H, animated: false });
    }
  }, []);

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const clamped = Math.max(0, Math.min(i, items.length - 1));
    onSelect(items[clamped]);
    listRef.current?.scrollToOffset({ offset: clamped * ITEM_H, animated: true });
  }

  const padding = Array(PAD).fill(null);

  return (
    <View style={wS.wheel}>
      {/* selection highlight */}
      <View style={wS.highlight} pointerEvents="none" />

      <FlatList
        ref={listRef}
        data={[...padding, ...items, ...padding]}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({ length: ITEM_H, offset: i * ITEM_H, index: i })}
        renderItem={({ item, index }) => {
          const actual = index - PAD;
          const isSelected = item !== null && item === selected;
          const isFaded = item === null;
          return (
            <View style={wS.item}>
              <Text style={[wS.itemText, isSelected && wS.itemSelected, isFaded && wS.itemFaded]}>
                {item !== null ? (typeof item === "number" ? String(item).padStart(2, "0") : item) : ""}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const wS = StyleSheet.create({
  wheel: { flex: 1, height: ITEM_H * VISIBLE, overflow: "hidden" },
  highlight: {
    position: "absolute",
    top: ITEM_H * PAD,
    left: 4,
    right: 4,
    height: ITEM_H,
    backgroundColor: "#eef2ff",
    borderRadius: 10,
    zIndex: 0,
  },
  item: { height: ITEM_H, alignItems: "center", justifyContent: "center" },
  itemText: { fontSize: 17, color: "#9ca3af", fontWeight: "500" },
  itemSelected: { fontSize: 19, color: PRIMARY, fontWeight: "800" },
  itemFaded: { opacity: 0 },
});

/* ── Public component ── */
interface Props {
  label?: string;
  required?: boolean;
  value: string;           // "YYYY-MM-DD"
  onChange: (v: string) => void;
}

export default function DatePickerField({ label = "Date", required, value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const parsed = value ? value.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()];
  const [year,  setYear]  = useState(parsed[0]);
  const [month, setMonth] = useState(parsed[1]);
  const [day,   setDay]   = useState(parsed[2]);

  const years = range(2020, 2030);
  const months = range(1, 12);
  const days = range(1, daysInMonth(month, year));

  function onConfirm() {
    const safeDay = Math.min(day, daysInMonth(month, year));
    const iso = `${year}-${String(month).padStart(2,"0")}-${String(safeDay).padStart(2,"0")}`;
    onChange(iso);
    setOpen(false);
  }

  return (
    <View>
      <Text style={S.label}>{label}{required && <Text style={S.req}> *</Text>}</Text>

      <TouchableOpacity style={S.trigger} onPress={() => setOpen(true)} activeOpacity={0.75}>
        <Text style={[S.triggerText, !value && S.placeholder]}>
          {value ? formatDisplay(value) : "Select date"}
        </Text>
        <Text style={S.calIcon}>📅</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={S.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />

        <View style={S.sheet}>
          <View style={S.sheetHeader}>
            <Text style={S.sheetTitle}>Select Date</Text>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <Text style={S.sheetClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Column labels */}
          <View style={S.colLabels}>
            <Text style={[S.colLabel, { flex: 1 }]}>Day</Text>
            <Text style={[S.colLabel, { flex: 1 }]}>Month</Text>
            <Text style={[S.colLabel, { flex: 2 }]}>Year</Text>
          </View>

          {/* Wheels */}
          <View style={S.wheels}>
            <Wheel items={days}   selected={day}   onSelect={(v) => setDay(Number(v))} />
            <View style={S.divider} />
            <Wheel
              items={MONTHS}
              selected={MONTHS[month - 1]}
              onSelect={(v) => setMonth(MONTHS.indexOf(v as string) + 1)}
            />
            <View style={S.divider} />
            <Wheel items={years}  selected={year}  onSelect={(v) => setYear(Number(v))} />
          </View>

          {/* Confirm */}
          <TouchableOpacity style={S.confirmBtn} onPress={onConfirm} activeOpacity={0.85}>
            <Text style={S.confirmText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  label: { fontSize: 11, fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 },
  req: { color: "#ef4444" },
  trigger: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1.5, borderColor: "#e5e7eb", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: "#fafafa",
  },
  triggerText: { fontSize: 15, color: "#111827", flex: 1, fontWeight: "600" },
  placeholder: { color: "#9ca3af", fontWeight: "400" },
  calIcon: { fontSize: 18 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 36,
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
  },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
  sheetClose: { fontSize: 18, color: "#9ca3af", padding: 4 },

  colLabels: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  colLabel: { textAlign: "center", fontSize: 10, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 },

  wheels: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, gap: 0,
  },
  divider: { width: 1, height: ITEM_H * VISIBLE * 0.6, backgroundColor: "#e5e7eb" },

  confirmBtn: {
    marginHorizontal: 20, marginTop: 20,
    backgroundColor: PRIMARY, borderRadius: 14,
    paddingVertical: 15, alignItems: "center",
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  confirmText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
