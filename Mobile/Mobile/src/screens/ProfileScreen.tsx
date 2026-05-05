import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import type { RootStackParamList } from "../../App";
import { api, clearToken, loadUserProfile, saveUserProfile } from "@/api";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

type Profile = {
  employeeId?: string | null;
  fullName?:   string | null;
  mobile?:     string | null;
  department?: string | null;
  managerName?: string | null;
  band?:       string | null;
  location?:   string | null;
  costCenter?: string | null;
};

type User = {
  id?:        string;
  email?:     string;
  roles?:     string[];
  createdAt?: string;
  profile?:   Profile | null;
};

const BAND_LABELS: Record<string, string> = {
  L1: "Level 1 — Junior",
  L2: "Level 2 — Mid",
  L3: "Level 3 — Senior",
  M1: "Manager",
  M2: "Senior Manager",
  DIR: "Director",
};

function initials(name?: string | null, email?: string) {
  const src = name?.trim() || email || "";
  if (!src) return "?";
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ProfileScreen({ navigation }: Props) {
  const [user,        setUser]        = useState<User | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [showLogout,  setShowLogout]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const cached = (await loadUserProfile()) as User | null;
    if (cached) setUser(cached);
    try {
      const { data } = await api.get<User>("/auth/me");
      setUser(data);
      await saveUserProfile(data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !user) {
    return (
      <View style={S.center}>
        <ActivityIndicator size="large" color="#1a237e" />
        <Text style={S.loadingText}>Loading profile…</Text>
      </View>
    );
  }

  const p = user?.profile ?? {};
  const displayName = p.fullName?.trim() || user?.email?.split("@")[0] || "User";
  const bandLabel = p.band ? (BAND_LABELS[p.band] ?? p.band) : null;

  return (
    <ScrollView style={S.root} contentContainerStyle={S.content}>

      {/* ── Profile Hero Card ── */}
      <View style={S.heroCard}>
        <View style={S.avatar}>
          <Text style={S.avatarText}>{initials(p.fullName, user?.email)}</Text>
        </View>
        <Text style={S.heroName}>{displayName}</Text>
        <Text style={S.heroEmail}>{user?.email ?? "—"}</Text>
        {bandLabel && (
          <View style={S.bandBadge}>
            <Text style={S.bandBadgeText}>{bandLabel}</Text>
          </View>
        )}
      </View>

      {/* ── Employment Info ── */}
      <View style={S.card}>
        <Text style={S.cardTitle}>Employment</Text>
        <Row label="Employee ID" value={p.employeeId} />
        <Row label="Department"  value={p.department} />
        <Row label="Manager"     value={p.managerName} />
        <Row label="Band"        value={p.band} />
      </View>

      {/* ── Contact ── */}
      <View style={S.card}>
        <Text style={S.cardTitle}>Contact</Text>
        <Row label="Email"  value={user?.email} />
        <Row label="Mobile" value={p.mobile} />
      </View>

      {/* ── Workplace ── */}
      <View style={S.card}>
        <Text style={S.cardTitle}>Workplace</Text>
        <Row label="Location"    value={p.location} />
        <Row label="Cost Center" value={p.costCenter} />
      </View>

      {/* ── Account ── */}
      <View style={S.card}>
        <Text style={S.cardTitle}>Account</Text>
        <Row label="Member Since" value={formatDate(user?.createdAt)} />
        {user?.roles && user.roles.length > 0 && (
          <Row label="Role" value={user.roles.join(", ")} />
        )}
      </View>

      {/* ── Sign out ── */}
      <TouchableOpacity
        style={S.signOutBtn}
        onPress={() => setShowLogout(true)}
        activeOpacity={0.85}
      >
        <Text style={S.signOutText}>🚪  Sign out</Text>
      </TouchableOpacity>

      {/* ── Logout Confirm Modal ── */}
      <Modal
        visible={showLogout}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogout(false)}
      >
        <Pressable style={S.modalBackdrop} onPress={() => setShowLogout(false)}>
          <Pressable style={S.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={S.modalIconWrap}>
              <Text style={S.modalIcon}>👋</Text>
            </View>
            <Text style={S.modalTitle}>Sign out?</Text>
            <Text style={S.modalMessage}>
              You'll be returned to the login screen and will need to sign in again to continue.
            </Text>
            <View style={S.modalActions}>
              <TouchableOpacity
                style={S.modalCancelBtn}
                onPress={() => setShowLogout(false)}
                activeOpacity={0.8}
              >
                <Text style={S.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={S.modalConfirmBtn}
                onPress={async () => {
                  setShowLogout(false);
                  await clearToken();
                  navigation.replace("Login");
                }}
                activeOpacity={0.85}
              >
                <Text style={S.modalConfirmText}>Sign out</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  const display = value && value.trim().length > 0 ? value : "—";
  const isEmpty = display === "—";
  return (
    <View style={S.row}>
      <Text style={S.rowLabel}>{label}</Text>
      <Text style={[S.rowValue, isEmpty && S.rowValueEmpty]}>{display}</Text>
    </View>
  );
}

const PRIMARY = "#1a237e";

const S = StyleSheet.create({
  root:        { flex: 1, backgroundColor: "#f1f3f9" },
  content:     { padding: 16, gap: 14, paddingBottom: 40 },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#f1f3f9" },
  loadingText: { fontSize: 14, color: "#6b7280" },

  heroCard: {
    backgroundColor: PRIMARY,
    borderRadius: 20, padding: 24, alignItems: "center", gap: 6,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6,
  },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "rgba(255,255,255,0.3)",
    marginBottom: 4,
  },
  avatarText: { color: "#fff", fontSize: 30, fontWeight: "800", letterSpacing: 1 },
  heroName:   { fontSize: 20, fontWeight: "800", color: "#fff" },
  heroEmail:  { fontSize: 13, color: "rgba(255,255,255,0.75)" },
  bandBadge:  {
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6,
  },
  bandBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },

  card: {
    backgroundColor: "#fff", borderRadius: 18, padding: 16, gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  cardTitle: { fontSize: 11, fontWeight: "800", color: "#374151", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },

  row:           { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  rowLabel:      { fontSize: 13, color: "#6b7280" },
  rowValue:      { fontSize: 14, fontWeight: "600", color: "#111827", maxWidth: "60%", textAlign: "right" },
  rowValueEmpty: { color: "#cbd5e1", fontWeight: "500" },

  signOutBtn:  {
    backgroundColor: "#fff", borderRadius: 14, paddingVertical: 14,
    alignItems: "center", borderWidth: 1.5, borderColor: "#fee2e2", marginTop: 4,
  },
  signOutText: { color: "#dc2626", fontSize: 15, fontWeight: "700" },

  // Logout confirm modal
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(13, 21, 71, 0.55)",
    alignItems: "center", justifyContent: "center", padding: 28,
  },
  modalCard: {
    width: "100%", maxWidth: 360,
    backgroundColor: "#fff", borderRadius: 22, padding: 24,
    alignItems: "center", gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 12,
  },
  modalIconWrap: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: "#fef3c7",
    alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  modalIcon:    { fontSize: 32 },
  modalTitle:   { fontSize: 20, fontWeight: "800", color: "#111827" },
  modalMessage: { fontSize: 13, color: "#6b7280", textAlign: "center", lineHeight: 19, paddingHorizontal: 4 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 14, width: "100%" },
  modalCancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center",
    backgroundColor: "#f1f5f9", borderWidth: 1.5, borderColor: "#e5e7eb",
  },
  modalCancelText: { color: "#374151", fontSize: 14, fontWeight: "700" },
  modalConfirmBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center",
    backgroundColor: "#dc2626",
    shadowColor: "#dc2626", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  modalConfirmText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
