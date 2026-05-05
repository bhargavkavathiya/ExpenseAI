import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { RootStackParamList } from "../../App";
import { api, saveUserProfile, setToken } from "@/api";
import AppLogo from "@/components/AppLogo";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

const REMEMBER_KEY = "remember_me_credentials";

export default function LoginScreen({ navigation }: Props) {
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [busy,       setBusy]       = useState(false);

  // Restore saved credentials on mount
  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (saved.email)    setEmail(saved.email);
        if (saved.password) setPassword(saved.password);
        setRememberMe(true);
      } catch {}
    });
  }, []);

  async function onSubmit() {
    if (!email.trim() || !password) {
      Alert.alert("Validation error", "Email and password are required.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", { email: email.trim(), password });
      await setToken(data.accessToken);
      if (data.user) await saveUserProfile(data.user);

      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_KEY, JSON.stringify({ email: email.trim(), password }));
      } else {
        await AsyncStorage.removeItem(REMEMBER_KEY);
      }

      navigation.replace("Dashboard");
    } catch (err: any) {
      const data = err?.response?.data;
      let msg = err.message;
      if (data) {
        if (data.errors && typeof data.errors === "object" && !Array.isArray(data.errors)) {
          msg = Object.values(data.errors as Record<string, string[]>).flat().join("\n");
        } else if (data.detail) { msg = data.detail; }
        else if (data.title)    { msg = data.title; }
      }
      Alert.alert("Sign-in failed", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">

        {/* Logo / Branding */}
        <View style={styles.brandArea}>
          <AppLogo size="lg" />
          <Text style={styles.appName}>ExpenseIQ Pro</Text>
          <Text style={styles.tagline}>AI-powered receipt auditing with policy compliance</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="you@company.com"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              onSubmitEditing={onSubmit}
              returnKeyType="done"
            />
          </View>

          {/* Remember Me */}
          <TouchableOpacity
            style={styles.rememberRow}
            onPress={() => setRememberMe((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxOn]}>
              {rememberMe && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={styles.rememberLabel}>Remember me</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, busy && styles.btnDisabled]}
            onPress={onSubmit}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{busy ? "Signing in…" : "Sign In"}</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account?</Text>
          <TouchableOpacity onPress={() => navigation.navigate("Register")}>
            <Text style={styles.link}>  Create account →</Text>
          </TouchableOpacity>
        </View>

        {/* Demo hint */}
        {/* <View style={styles.demoBox}>
          <Text style={styles.demoTitle}>Demo Credentials</Text>
          <Text style={styles.demoText}>customer@demo.local / Customer@123</Text>
        </View> */}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const PRIMARY = "#1a237e";

const styles = StyleSheet.create({
  root: { flexGrow: 1, backgroundColor: "#f1f3f9", padding: 24, justifyContent: "center", gap: 20 },

  brandArea: { alignItems: "center", gap: 8, marginBottom: 4 },
  appName: { fontSize: 26, fontWeight: "800", color: PRIMARY },
  tagline: { fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 18, maxWidth: 260 },

  card: { backgroundColor: "#fff", borderRadius: 20, padding: 24, gap: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  cardTitle: { fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 4 },

  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1.5, borderColor: "#e5e7eb", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#111827", backgroundColor: "#fafafa" },

  rememberRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: -4 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
    alignItems: "center", justifyContent: "center",
  },
  checkboxOn: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  checkMark: { color: "#fff", fontSize: 12, fontWeight: "800", lineHeight: 14 },
  rememberLabel: { fontSize: 14, color: "#374151", fontWeight: "500" },

  btn: { backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4, shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontSize: 14, color: "#6b7280" },
  link: { fontSize: 14, color: PRIMARY, fontWeight: "700" },

  demoBox: { backgroundColor: "#eef2ff", borderRadius: 10, padding: 12, alignItems: "center", gap: 2 },
  demoTitle: { fontSize: 11, fontWeight: "700", color: PRIMARY, textTransform: "uppercase", letterSpacing: 0.5 },
  demoText: { fontSize: 12, color: "#4338ca" },
});
