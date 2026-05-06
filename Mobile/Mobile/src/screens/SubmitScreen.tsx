import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { api, apiBase, clearToken, getToken, loadUserProfile } from "@/api";
import DatePickerField from "@/components/DatePickerField";
import PickerField from "@/components/PickerField";

type Props = NativeStackScreenProps<RootStackParamList, "Submit">;

const CATEGORIES = ["Meals", "Hotel", "Fuel", "Travel", "Entertainment", "Office Supplies", "Medical", "Training", "Other"];
const PAYMENT_MODES = ["Corporate Card", "Personal Card", "Cash", "UPI", "Net Banking"];
const DEPARTMENTS = ["Sales", "Engineering", "Marketing", "Finance", "HR", "Operations", "IT", "Legal", "Procurement", "Mobility"];

const today = new Date().toISOString().slice(0, 10);

export default function SubmitScreen({ navigation }: Props) {
  const [uri,       setUri]       = useState<string | null>(null);
  const [busy,      setBusy]      = useState(false);
  const [scanning,  setScanning]  = useState(false);
  const [ocrFilled, setOcrFilled] = useState<string[]>([]); // which fields were auto-filled

  // Employee
  const [employeeName, setEmployeeName] = useState("");
  const [department,   setDepartment]   = useState("");

  // Claim details
  const [category,        setCategory]        = useState("Meals");
  const [paymentMode,     setPaymentMode]      = useState("Corporate Card");
  const [amount,          setAmount]           = useState("");
  const [claimedDate,     setClaimedDate]      = useState(today);
  const [merchantName,    setMerchantName]     = useState("");
  const [gstin,           setGstin]            = useState("");
  const [gstinStatus,     setGstinStatus]      = useState<"idle" | "checking" | "verified" | "invalid" | "not_found" | "error">("idle");
  const [gstinLegalName,  setGstinLegalName]   = useState("");
  const [gstinState,      setGstinState]       = useState("");
  const gstinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Context
  const [purpose, setPurpose] = useState("");
  const [city,    setCity]    = useState("");

  // Prefill from saved profile
  useEffect(() => {
    loadUserProfile().then((u) => {
      if (!u) return;
      if (u.profile?.fullName)   setEmployeeName(u.profile.fullName);
      if (u.profile?.department) setDepartment(u.profile.department);
    });
  }, []);

  useEffect(() => {
    if (gstinTimer.current) clearTimeout(gstinTimer.current);

    if (gstin.length !== 15) {
      setGstinStatus("idle");
      setGstinLegalName("");
      setGstinState("");
      return;
    }

    setGstinStatus("checking");
    gstinTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/gstin/${gstin}`);
        setGstinLegalName(data.legalName ?? "");
        setGstinState(data.state ?? "");
        if (data.verified) {
          setGstinStatus("verified");
        } else {
          setGstinStatus(data.status === "invalid_format" ? "invalid" : data.status === "not_found" ? "not_found" : "error");
        }
      } catch {
        setGstinStatus("error");
      }
    }, 400);
  }, [gstin]);

  async function uriToBase64(uri: string): Promise<string | null> {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.includes(",") ? result.split(",")[1] : result);
        };
        reader.onerror = () => reject(new Error("FileReader error"));
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  async function runOcrPreview(imageUri: string) {
    setScanning(true);
    setOcrFilled([]);
    try {
      const base64 = await uriToBase64(imageUri);
      if (!base64) return;
      const { data } = await api.post(
        "/expenses/ocr-preview-b64",
        { imageBase64: base64, mimeType: "image/jpeg" },
        { timeout: 30000 },
      );
      const filled: string[] = [];
      if (data.total && Number(data.total) > 0) { setAmount(String(data.total)); filled.push("amount"); }
      if (data.vendor)  { setMerchantName(data.vendor); filled.push("merchant"); }
      if (data.gstin)   { setGstin(data.gstin.toUpperCase()); filled.push("gstin"); }
      if (data.date)    { setClaimedDate(data.date); filled.push("date"); }
      setOcrFilled(filled);
    } catch (err: any) {
      console.warn("OCR preview failed (manual entry still works):", err?.message ?? err);
    } finally {
      setScanning(false);
    }
  }

  async function pickFromGallery() {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });
    if (!res.canceled) {
      const asset = res.assets[0];
      setUri(asset.uri);
      runOcrPreview(asset.uri).catch(() => {});
    }
  }

  async function capture() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission denied", "Camera access is required."); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!res.canceled) {
      const asset = res.assets[0];
      setUri(asset.uri);
      runOcrPreview(asset.uri).catch(() => {});
    }
  }

  function canSubmit() {
    return !!uri && !!purpose.trim() && !!merchantName.trim() && !!claimedDate && Number(amount) > 0;
  }

  async function submit() {
    if (!canSubmit()) {
      Alert.alert("Missing fields", "Please fill in Amount, Date, Merchant Name, Business Purpose and attach a receipt.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("receipt", { uri: uri!, name: "receipt.jpg", type: "image/jpeg" } as unknown as Blob);
      form.append("category",        category);
      form.append("paymentMode",     paymentMode);
      form.append("claimedAmount",   amount.trim());
      form.append("claimedDate",     claimedDate);
      form.append("claimedMerchant", merchantName.trim());
      if (gstin.trim())            form.append("claimedGstin",  gstin.trim().toUpperCase());
      if (purpose.trim())          form.append("purpose",       purpose.trim());
      if (city.trim())             form.append("city",          city.trim());
      if (employeeName.trim())     form.append("employeeName",  employeeName.trim());
      if (department.trim())       form.append("department",    department);

      // Use fetch instead of axios for multipart — axios + FormData + file URI fails in RN new arch
      const token = await getToken();
      const response = await fetch(`${apiBase}/expenses`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });

      if (response.status === 401) { await clearToken(); navigation.replace("Login"); return; }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        Alert.alert("Submission failed", errData.detail ?? errData.title ?? `Server error ${response.status}`);
        return;
      }

      const data = await response.json();
      navigation.replace("Ack", { refId: data.refId });
    } catch (err: any) {
      Alert.alert("Submission failed", err?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={S.root} contentContainerStyle={S.content} keyboardShouldPersistTaps="handled">

        {/* ── Header ── */}
        <View style={S.pageHeader}>
          <View style={{ flex: 1 }}>
            <Text style={S.pageTitle}>New Expense</Text>
            <Text style={S.pageSubtitle}>AI-powered audit with policy compliance</Text>
          </View>
        </View>

        {/* ══ SECTION: Receipt ══ */}
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <View style={S.sectionDot} />
            <Text style={S.sectionTitle}>Receipt Document</Text>
            <Text style={S.req}>*</Text>
          </View>

          {uri ? (
            <View style={S.previewWrap}>
              <Image source={{ uri }} style={S.preview} resizeMode="cover" />
              <TouchableOpacity style={S.changeBtn} onPress={pickFromGallery}>
                <Text style={S.changeBtnText}>↺  Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={S.dropzone} onPress={pickFromGallery} activeOpacity={0.7}>
              <Text style={S.dropIcon}>📄</Text>
              <Text style={S.dropText}>Tap to upload receipt</Text>
              <Text style={S.dropHint}>JPEG · PNG supported</Text>
            </TouchableOpacity>
          )}

          <View style={S.imgRow}>
            <TouchableOpacity style={S.imgBtn} onPress={capture}>
              <Text style={S.imgBtnIcon}>📷</Text>
              <Text style={S.imgBtnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.imgBtn} onPress={pickFromGallery}>
              <Text style={S.imgBtnIcon}>🖼️</Text>
              <Text style={S.imgBtnText}>Gallery</Text>
            </TouchableOpacity>
          </View>

          {/* OCR scanning progress / success banner */}
          {scanning && (
            <View style={S.ocrBanner}>
              <ActivityIndicator size="small" color="#7c3aed" />
              <Text style={S.ocrBannerText}>Scanning receipt with AI…</Text>
            </View>
          )}
          {!scanning && ocrFilled.length > 0 && (
            <View style={[S.ocrBanner, S.ocrBannerDone]}>
              <Text style={S.ocrBannerIcon}>✨</Text>
              <Text style={[S.ocrBannerText, S.ocrBannerDoneText]}>
                Auto-filled: {ocrFilled.join(", ")} — please verify and edit if needed
              </Text>
            </View>
          )}
        </View>

        {/* ══ SECTION: Employee ══ */}
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <View style={S.sectionDot} />
            <Text style={S.sectionTitle}>Employee</Text>
          </View>

          <View style={S.row2}>
            <View style={S.col}>
              <Field label="Employee Name">
                <TextInput
                  style={S.input}
                  placeholder="Enter employee name"
                  placeholderTextColor="#9ca3af"
                  value={employeeName}
                  onChangeText={setEmployeeName}
                />
              </Field>
              <Text style={S.hint}>Prefilled from your profile. Edit if this claim is on behalf of someone else.</Text>
            </View>
            <View style={S.col}>
              <PickerField
                label="Department"
                value={department}
                options={DEPARTMENTS}
                placeholder="—"
                onSelect={setDepartment}
              />
            </View>
          </View>
        </View>

        {/* ══ SECTION: Claim Details ══ */}
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <View style={S.sectionDot} />
            <Text style={S.sectionTitle}>Claim Details</Text>
          </View>

          <View style={S.row2}>
            <View style={S.col}>
              <PickerField label="Category" required value={category} options={CATEGORIES} onSelect={setCategory} />
            </View>
            <View style={S.col}>
              <PickerField label="Payment Mode" value={paymentMode} options={PAYMENT_MODES} onSelect={setPaymentMode} />
            </View>
          </View>

          <View style={S.row2}>
            <View style={S.col}>
              <Field label="Amount (₹)" required>
                <View style={[S.amountWrap, scanning && S.amountWrapScanning]}>
                  <View style={S.amountPrefix}>
                    <Text style={S.amountPrefixText}>₹</Text>
                  </View>
                  <TextInput
                    style={S.amountInput}
                    placeholder="0.00"
                    placeholderTextColor="#9ca3af"
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={(t) => { setAmount(t); setOcrFilled(f => f.filter(x => x !== "amount")); }}
                  />
                  {scanning && (
                    <View style={S.scanBadge}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  )}
                  {!scanning && ocrFilled.includes("amount") && (
                    <View style={S.scanBadge}>
                      <Text style={S.scanBadgeText}>AI</Text>
                    </View>
                  )}
                </View>
                {!scanning && ocrFilled.includes("amount") && (
                  <Text style={S.scanHint}>Auto-filled — tap to edit</Text>
                )}
              </Field>
            </View>
            <View style={S.col}>
              <DatePickerField label="Date" required value={claimedDate} onChange={setClaimedDate} />
            </View>
          </View>

          <Field label="Merchant Name" required>
            <TextInput
              style={[S.input, !scanning && ocrFilled.includes("merchant") && S.inputOcrFilled]}
              placeholder="Hotel Grand Hyatt · Auto Travels · Swiggy …"
              placeholderTextColor="#9ca3af"
              value={merchantName}
              onChangeText={(t) => { setMerchantName(t); setOcrFilled(f => f.filter(x => x !== "merchant")); }}
            />
            {!scanning && ocrFilled.includes("merchant") && (
              <Text style={S.scanHint}>Auto-filled — tap to edit</Text>
            )}
          </Field>

          <Field label="GSTIN">
            <View style={[
              S.gstinWrap,
              gstinStatus === "verified"  && S.gstinWrapOk,
              (gstinStatus === "invalid" || gstinStatus === "not_found" || gstinStatus === "error") && S.gstinWrapFail,
              gstinStatus === "checking"  && S.gstinWrapChecking,
            ]}>
              <TextInput
                style={[S.gstinInput, S.mono]}
                placeholder="27AABCU9603R1ZX"
                placeholderTextColor="#9ca3af"
                value={gstin}
                onChangeText={(t) => { setGstin(t.toUpperCase()); setOcrFilled(f => f.filter(x => x !== "gstin")); }}
                maxLength={15}
                autoCapitalize="characters"
              />
              {gstinStatus === "checking" && (
                <View style={S.gstinBadge}>
                  <ActivityIndicator size="small" color="#7c3aed" />
                </View>
              )}
              {gstinStatus === "verified" && (
                <View style={[S.gstinBadge, S.gstinBadgeOk]}>
                  <Text style={S.gstinBadgeText}>✓</Text>
                </View>
              )}
              {(gstinStatus === "invalid" || gstinStatus === "not_found" || gstinStatus === "error") && (
                <View style={[S.gstinBadge, S.gstinBadgeFail]}>
                  <Text style={S.gstinBadgeText}>✗</Text>
                </View>
              )}
            </View>

            {gstinStatus === "idle" && !ocrFilled.includes("gstin") && (
              <Text style={S.hint}>15-char GSTIN — verified automatically when complete.</Text>
            )}
            {gstinStatus === "idle" && ocrFilled.includes("gstin") && !scanning && (
              <Text style={S.scanHint}>Auto-filled from receipt — tap to edit</Text>
            )}
            {gstinStatus === "checking" && (
              <Text style={S.gstinChecking}>Verifying with GST registry…</Text>
            )}
            {gstinStatus === "verified" && (
              <View style={S.gstinStatusRow}>
                <Text style={S.gstinOkIcon}>✓</Text>
                <View>
                  <Text style={S.gstinOkText}>Verified</Text>
                  {!!gstinLegalName && <Text style={S.gstinOkDetail}>{gstinLegalName}{gstinState ? `  ·  ${gstinState}` : ""}</Text>}
                </View>
              </View>
            )}
            {gstinStatus === "invalid" && (
              <View style={S.gstinStatusRow}>
                <Text style={S.gstinFailIcon}>✗</Text>
                <Text style={S.gstinFailText}>Invalid GSTIN format</Text>
              </View>
            )}
            {gstinStatus === "not_found" && (
              <View style={S.gstinStatusRow}>
                <Text style={S.gstinFailIcon}>✗</Text>
                <Text style={S.gstinFailText}>GSTIN not found in registry</Text>
              </View>
            )}
            {gstinStatus === "error" && (
              <View style={S.gstinStatusRow}>
                <Text style={S.gstinFailIcon}>✗</Text>
                <Text style={S.gstinFailText}>Could not verify — check your connection</Text>
              </View>
            )}
          </Field>
        </View>

        {/* ══ SECTION: Context ══ */}
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <View style={S.sectionDot} />
            <Text style={S.sectionTitle}>Context</Text>
          </View>

          <Field label="Business Purpose" required>
            <TextInput
              style={[S.input, S.textarea]}
              placeholder="Client lunch with Infosys team · vendor onsite travel · team offsite …"
              placeholderTextColor="#9ca3af"
              value={purpose}
              onChangeText={setPurpose}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </Field>

          <View style={{ maxWidth: "55%" }}>
            <Field label="City">
              <TextInput
                style={S.input}
                placeholder="Mumbai"
                placeholderTextColor="#9ca3af"
                value={city}
                onChangeText={setCity}
              />
            </Field>
          </View>
        </View>

        {/* ══ Submit ══ */}
        <View style={S.footer}>
          <TouchableOpacity
            style={[S.submitBtn, (!canSubmit() || busy) && S.submitBtnDisabled]}
            onPress={submit}
            disabled={!canSubmit() || busy}
            activeOpacity={0.85}
          >
            <Text style={S.submitBtnText}>
              {busy ? "⚡  Auditing Receipt…" : "⚡  Submit & Audit"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.historyLink} onPress={() => navigation.navigate("MyExpenses")}>
            <Text style={S.historyLinkText}>📋  View my previous expenses</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── Small Field wrapper ── */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={fieldS.label}>{label}{required && <Text style={fieldS.req}> *</Text>}</Text>
      {children}
    </View>
  );
}
const fieldS = StyleSheet.create({
  label: { fontSize: 11, fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 },
  req: { color: "#ef4444" },
});

/* ── Styles ── */
const PRIMARY = "#1a237e";

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1f3f9" },
  content: { padding: 18, gap: 16, paddingBottom: 48 },

  pageHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 2 },
  pageTitle: { fontSize: 22, fontWeight: "800", color: PRIMARY, letterSpacing: -0.3 },
  pageSubtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },

  section: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: -2 },
  sectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: 1 },
  req: { color: "#ef4444", fontWeight: "700", fontSize: 14 },

  dropzone: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#f8fafc", borderRadius: 14,
    borderWidth: 1.5, borderColor: "#cbd5e1", borderStyle: "dashed",
    paddingVertical: 32, gap: 6,
  },
  dropIcon: { fontSize: 32 },
  dropText: { fontSize: 14, color: "#334155", fontWeight: "600" },
  dropHint: { fontSize: 12, color: "#94a3b8" },

  previewWrap: { borderRadius: 14, overflow: "hidden", position: "relative" },
  preview: { width: "100%", height: 220 },
  changeBtn: {
    position: "absolute", bottom: 10, right: 10,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  changeBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  imgRow: { flexDirection: "row", gap: 10 },
  imgBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#f8fafc", borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  imgBtnIcon: { fontSize: 16 },
  imgBtnText: { fontSize: 13, color: "#334155", fontWeight: "600" },

  row2: { flexDirection: "row", gap: 12 },
  col: { flex: 1, gap: 5 },

  input: {
    borderWidth: 1.5, borderColor: "#e5e7eb", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: "#111827", backgroundColor: "#fafafa",
  },
  mono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", letterSpacing: 0.5 },
  textarea: { minHeight: 80 },

  amountWrap: { flexDirection: "row", borderWidth: 1.5, borderColor: "#e5e7eb", borderRadius: 10, overflow: "hidden", backgroundColor: "#fafafa" },
  amountWrapScanning: { borderColor: "#7c3aed", backgroundColor: "#faf5ff" },
  amountPrefix: { backgroundColor: "#e5e7eb", paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  amountPrefixText: { fontSize: 17, fontWeight: "800", color: "#374151" },
  amountInput: { flex: 1, fontSize: 18, fontWeight: "700", color: "#111827", paddingHorizontal: 12, paddingVertical: 12 },
  scanBadge: { backgroundColor: "#7c3aed", paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  scanBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  scanHint: { fontSize: 11, color: "#7c3aed", fontWeight: "600", marginTop: 3 },

  inputOcrFilled: { borderColor: "#7c3aed", backgroundColor: "#faf5ff" },

  ocrBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#f3f0ff", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: "#ede9fe",
  },
  ocrBannerDone: { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" },
  ocrBannerIcon: { fontSize: 14 },
  ocrBannerText: { fontSize: 12, color: "#7c3aed", fontWeight: "600", flex: 1 },
  ocrBannerDoneText: { color: "#16a34a" },

  hint: { fontSize: 11, color: "#94a3b8", lineHeight: 15 },

  footer: { gap: 14, marginTop: 4 },
  submitBtn: {
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 17,
    alignItems: "center",
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },

  historyLink: { alignItems: "center", paddingVertical: 4 },
  historyLinkText: { fontSize: 14, color: PRIMARY, fontWeight: "700" },

  // GSTIN verification
  gstinWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: "#e5e7eb", borderRadius: 10,
    backgroundColor: "#fafafa", overflow: "hidden",
  },
  gstinWrapOk:       { borderColor: "#16a34a", backgroundColor: "#f0fdf4" },
  gstinWrapFail:     { borderColor: "#ef4444", backgroundColor: "#fff5f5" },
  gstinWrapChecking: { borderColor: "#7c3aed", backgroundColor: "#faf5ff" },
  gstinInput: {
    flex: 1,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: "#111827",
  },
  gstinBadge: {
    paddingHorizontal: 16,
    alignItems: "center", justifyContent: "center",
    alignSelf: "stretch", // Stretch to full height of parent gstinWrap
  },
  gstinBadgeOk:   { backgroundColor: "#16a34a" },
  gstinBadgeFail: { backgroundColor: "#ef4444" },
  gstinBadgeText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  gstinStatusRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 2 },
  gstinOkIcon:   { fontSize: 13, color: "#16a34a", fontWeight: "800", marginTop: 1 },
  gstinOkText:   { fontSize: 12, color: "#16a34a", fontWeight: "700" },
  gstinOkDetail: { fontSize: 11, color: "#15803d", marginTop: 1 },
  gstinFailIcon: { fontSize: 13, color: "#ef4444", fontWeight: "800", marginTop: 1 },
  gstinFailText: { fontSize: 12, color: "#ef4444", fontWeight: "600" },
  gstinChecking: { fontSize: 11, color: "#7c3aed", fontWeight: "600", marginTop: 2 },
});
