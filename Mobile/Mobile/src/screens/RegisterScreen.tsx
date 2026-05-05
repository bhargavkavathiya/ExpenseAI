import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import type { RootStackParamList } from "../../App";
import { api, saveUserProfile, setToken } from "@/api";
import AppLogo from "@/components/AppLogo";
import { expand, resetScreen } from "@/glossary";

type Props = NativeStackScreenProps<RootStackParamList, "Register">;

const BANDS = [
  { code: "L1",  label: "L1 — Associate" },
  { code: "L2",  label: "L2 — Senior Associate" },
  { code: "L3",  label: "L3 — Lead / Principal" },
  { code: "M1",  label: "M1 — Manager" },
  { code: "M2",  label: "M2 — Senior Manager" },
  { code: "DIR", label: "DIR — Director / VP" },
];

const STEPS = ["Account", "Profile"] as const;
type Step = typeof STEPS[number];

export default function RegisterScreen({ navigation }: Props) {
  resetScreen("Register");

  const [step, setStep] = useState<Step>("Account");

  // Step 1 — Account
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");

  // Step 2 — Employee profile (all optional)
  const [fullName,   setFullName]   = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [mobile,     setMobile]     = useState("");
  const [department, setDepartment] = useState("");
  const [managerName, setManagerName] = useState("");
  const [band,       setBand]       = useState("");
  const [location,   setLocation]   = useState("");
  const [costCenter, setCostCenter] = useState("");

  const [busy, setBusy] = useState(false);

  function validateAccount(): boolean {
    if (!email.trim())      { Alert.alert("Validation error", "Email is required."); return false; }
    if (!password)          { Alert.alert("Validation error", "Password is required."); return false; }
    if (password.length < 8){ Alert.alert("Validation error", "Password must be at least 8 characters."); return false; }
    if (password !== confirm){ Alert.alert("Validation error", "Passwords do not match."); return false; }
    return true;
  }

  function goNext() {
    if (!validateAccount()) return;
    setStep("Profile");
  }

  async function onRegister() {
    if (!validateAccount()) { setStep("Account"); return; }
    setBusy(true);
    try {
      const profile = {
        employeeId:         employeeId.trim() || null,
        fullName:           fullName.trim()   || null,
        mobile:             mobile.trim()     || null,
        department:         department.trim() || null,
        managerName:        managerName.trim()|| null,
        band:               band              || null,
        registrationSource: "mobile",
        location:           location.trim()   || null,
        costCenter:         costCenter.trim() || null,
      };
      const { data } = await api.post("/auth/register", {
        email: email.trim(),
        password,
        profile,
      });
      await setToken(data.accessToken);
      if (data.user) await saveUserProfile(data.user);
      navigation.replace("Dashboard");
    } catch (err: any) {
      const data = err?.response?.data;
      let msg = err.message;
      if (data) {
        // FluentValidation: { errors: { "Field": ["msg1", "msg2"] } }
        if (data.errors && typeof data.errors === "object" && !Array.isArray(data.errors)) {
          msg = Object.values(data.errors as Record<string, string[]>)
            .flat()
            .join("\n");
        } else if (Array.isArray(data.errors)) {
          msg = data.errors.join("\n");
        } else if (data.detail) {
          msg = data.detail;
        } else if (data.title) {
          msg = data.title;
        }
      }
      Alert.alert("Registration failed", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">

        {/* Branding */}
        <View style={styles.brandArea}>
          <AppLogo size="md" />
          <Text style={styles.appName}>ExpenseIQ Pro</Text>
          <Text style={styles.tagline}>
            {expand("AI", "Register")}-powered expense management
          </Text>
        </View>

        {/* Step Indicator */}
        <View style={styles.stepIndicator}>
          {STEPS.map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepDot, step === s && styles.stepDotActive, STEPS.indexOf(step) > i && styles.stepDotDone]}>
                {STEPS.indexOf(step) > i
                  ? <Text style={styles.stepCheck}>✓</Text>
                  : <Text style={[styles.stepNum, step === s && styles.stepNumActive]}>{i + 1}</Text>}
              </View>
              <Text style={[styles.stepLabel, step === s && styles.stepLabelActive]}>{s}</Text>
              {i < STEPS.length - 1 && <View style={[styles.stepLine, STEPS.indexOf(step) > i && styles.stepLineDone]} />}
            </View>
          ))}
        </View>

        {/* ── STEP 1: Account ── */}
        {step === "Account" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create Account</Text>
            <Text style={styles.cardSub}>Your login credentials</Text>

            <Field label="Email Address" required>
              <TextInput style={styles.input} placeholder="you@company.com" placeholderTextColor="#9ca3af"
                autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!busy} />
            </Field>

            <Field label="Password" required>
              <TextInput style={styles.input} placeholder="Minimum 8 characters" placeholderTextColor="#9ca3af"
                secureTextEntry value={password} onChangeText={setPassword} editable={!busy} />
            </Field>

            <Field label="Confirm Password" required>
              <TextInput style={styles.input} placeholder="Re-enter password" placeholderTextColor="#9ca3af"
                secureTextEntry value={confirm} onChangeText={setConfirm} editable={!busy}
                onSubmitEditing={goNext} returnKeyType="next" />
            </Field>

            <TouchableOpacity style={styles.btn} onPress={goNext} activeOpacity={0.85}>
              <Text style={styles.btnText}>Continue →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 2: Employee Profile ── */}
        {step === "Profile" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Employee Profile</Text>
            <Text style={styles.cardSub}>Optional — helps with policy matching and allowance limits</Text>

            <Field label="Full Name">
              <TextInput style={styles.input} placeholder="John Doe" placeholderTextColor="#9ca3af"
                value={fullName} onChangeText={setFullName} editable={!busy} />
            </Field>

            <Field label="Employee ID">
              <TextInput style={styles.input} placeholder="EMP-001" placeholderTextColor="#9ca3af"
                autoCapitalize="characters" value={employeeId} onChangeText={setEmployeeId} editable={!busy} />
            </Field>

            <Field label="Mobile Number">
              <TextInput style={styles.input} placeholder="+91 9876543210" placeholderTextColor="#9ca3af"
                keyboardType="phone-pad" value={mobile} onChangeText={setMobile} editable={!busy} />
            </Field>

            <Field label="Department">
              <TextInput style={styles.input} placeholder="e.g. Engineering, Finance, Sales" placeholderTextColor="#9ca3af"
                value={department} onChangeText={setDepartment} editable={!busy} />
            </Field>

            <Field label="Manager Name">
              <TextInput style={styles.input} placeholder="Reporting manager" placeholderTextColor="#9ca3af"
                value={managerName} onChangeText={setManagerName} editable={!busy} />
            </Field>

            <Field label="Employee Band">
              <View style={styles.bandGrid}>
                {BANDS.map((b) => (
                  <TouchableOpacity
                    key={b.code}
                    style={[styles.bandChip, band === b.code && styles.bandChipSelected]}
                    onPress={() => setBand(band === b.code ? "" : b.code)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.bandCode, band === b.code && styles.bandCodeSelected]}>{b.code}</Text>
                    <Text style={[styles.bandLabel, band === b.code && styles.bandLabelSelected]} numberOfLines={1}>
                      {b.label.split("—")[1]?.trim()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="Location / City">
              <TextInput style={styles.input} placeholder="e.g. Mumbai, Bangalore" placeholderTextColor="#9ca3af"
                value={location} onChangeText={setLocation} editable={!busy} />
            </Field>

            <Field label="Cost Center">
              <TextInput style={styles.input} placeholder="e.g. CC-2024-TECH" placeholderTextColor="#9ca3af"
                autoCapitalize="characters" value={costCenter} onChangeText={setCostCenter} editable={!busy} />
            </Field>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.btnOutline} onPress={() => setStep("Account")} disabled={busy}>
                <Text style={styles.btnOutlineText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnFlex, busy && styles.btnDisabled]}
                onPress={onRegister} disabled={busy} activeOpacity={0.85}>
                <Text style={styles.btnText}>{busy ? "Creating…" : "Create Account"}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={onRegister} disabled={busy}>
              <Text style={styles.skipText}>Skip profile and register →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Sign in link */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => navigation.navigate("Login")}>
            <Text style={styles.link}>  Sign in →</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={fieldStyles.group}>
      <Text style={fieldStyles.label}>
        {label}{required && <Text style={fieldStyles.req}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  group: { gap: 5 },
  label: { fontSize: 12, fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: 0.4 },
  req: { color: "#ef4444" },
});

const PRIMARY = "#1a237e";

const styles = StyleSheet.create({
  root: { flexGrow: 1, backgroundColor: "#f1f3f9", padding: 20, gap: 18, paddingBottom: 40 },

  brandArea: { alignItems: "center", gap: 6, marginBottom: 4 },
  logoBox: { width: 64, height: 64, borderRadius: 18, backgroundColor: PRIMARY, alignItems: "center", justifyContent: "center", shadowColor: PRIMARY, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  logoIcon: { fontSize: 30 },
  appName: { fontSize: 24, fontWeight: "800", color: PRIMARY },
  tagline: { fontSize: 12, color: "#64748b", textAlign: "center", maxWidth: 240 },

  stepIndicator: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 0 },
  stepItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#e2e8f0", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#e2e8f0" },
  stepDotActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  stepDotDone: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  stepCheck: { color: "#fff", fontSize: 13, fontWeight: "800" },
  stepNum: { fontSize: 12, fontWeight: "700", color: "#9ca3af" },
  stepNumActive: { color: "#fff" },
  stepLabel: { fontSize: 12, color: "#9ca3af", fontWeight: "600" },
  stepLabelActive: { color: PRIMARY, fontWeight: "700" },
  stepLine: { width: 28, height: 2, backgroundColor: "#e2e8f0", marginHorizontal: 4 },
  stepLineDone: { backgroundColor: "#16a34a" },

  card: { backgroundColor: "#fff", borderRadius: 20, padding: 22, gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 4 },
  cardTitle: { fontSize: 20, fontWeight: "800", color: "#111827" },
  cardSub: { fontSize: 13, color: "#6b7280", marginTop: -8 },

  input: { borderWidth: 1.5, borderColor: "#e5e7eb", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#111827", backgroundColor: "#fafafa" },

  bandGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bandChip: { width: "30%", backgroundColor: "#f8fafc", borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1.5, borderColor: "#e2e8f0", gap: 2 },
  bandChipSelected: { backgroundColor: "#eef2ff", borderColor: PRIMARY },
  bandCode: { fontSize: 14, fontWeight: "800", color: "#374151" },
  bandCodeSelected: { color: PRIMARY },
  bandLabel: { fontSize: 9, color: "#6b7280", textAlign: "center" },
  bandLabelSelected: { color: "#4338ca" },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  btn: { backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 14, alignItems: "center", shadowColor: PRIMARY, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  btnFlex: { flex: 1 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  btnOutline: { borderWidth: 2, borderColor: PRIMARY, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, alignItems: "center" },
  btnOutlineText: { color: PRIMARY, fontSize: 15, fontWeight: "700" },
  skipText: { textAlign: "center", fontSize: 13, color: "#6b7280", textDecorationLine: "underline" },

  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontSize: 14, color: "#6b7280" },
  link: { fontSize: 14, color: PRIMARY, fontWeight: "700" },
});
