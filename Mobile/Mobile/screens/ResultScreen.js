import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { requestHumanReview } from '../services/api'

const STATUS_CONFIG = {
  approved: { color: '#2e7d32', bg: '#e8f5e9', icon: '✅', label: 'APPROVED' },
  rejected: { color: '#c62828', bg: '#ffebee', icon: '❌', label: 'REJECTED' },
  needs_review: { color: '#e65100', bg: '#fff3e0', icon: '⏳', label: 'NEEDS REVIEW' },
}

export default function ResultScreen({ navigation, route }) {
  const { result, refId } = route.params
  if (!result) return <View style={styles.center}><Text>No result data</Text></View>

  const status = result.status || 'needs_review'
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.needs_review
  const confidence = result.confidence || 0
  const pct = Math.round(confidence * 100)
  const breakdown = result.breakdown || {}
  const scores = result.module_scores || {}

  const handleHumanReview = async () => {
    try { await requestHumanReview(refId) } catch (e) { console.error(e) }
    navigation.navigate('Home')
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <View style={[styles.statusBanner, { backgroundColor: cfg.bg }]}>
        <Text style={styles.statusIcon}>{cfg.icon}</Text>
        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        <Text style={styles.refId}>Reference ID (Ref ID): {refId}</Text>
        {result.routed_to_review && (
          <Text style={styles.reviewNote}>Routed to analyst for review</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>AI (Artificial Intelligence) Confidence Score</Text>
        <View style={styles.confidenceRow}>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: cfg.color }]} />
          </View>
          <Text style={[styles.pct, { color: cfg.color }]}>{pct}%</Text>
        </View>
        <Text style={styles.confidenceNote}>
          {confidence >= 0.6
            ? 'Confidence above threshold — automated decision.'
            : 'Confidence below threshold (0.6) — sent for human review.'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Plain Language Explanation</Text>
        <Text style={styles.explanation}>{result.explanation}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>AI Audit Findings Breakdown</Text>
        {[
          { label: 'Optical Character Recognition (OCR)', icon: breakdown.ocr?.vendor ? '✅' : '⚠️', detail: breakdown.ocr?.vendor ? `Vendor: ${breakdown.ocr.vendor} | Total: ₹${breakdown.ocr.total}` : 'Could not extract receipt data', score: scores.ocr },
          { label: 'Duplicate Detection', icon: breakdown.duplicate?.is_duplicate ? '🚩' : '✅', detail: breakdown.duplicate?.is_duplicate ? `Duplicate of ${breakdown.duplicate.duplicate_of}` : 'No duplicate found', score: scores.duplicate },
          { label: 'Anomaly Detection', icon: breakdown.anomaly?.is_anomaly ? '🚩' : '✅', detail: breakdown.anomaly?.is_anomaly ? `Unusual amount detected (score: ${breakdown.anomaly?.score})` : 'Amount within normal range', score: scores.anomaly },
          { label: 'Policy Compliance', icon: breakdown.policy?.compliant ? '✅' : '🚩', detail: breakdown.policy?.compliant ? 'Meets company policy' : (breakdown.policy?.violations?.join(', ') || 'Policy violation'), score: scores.policy },
          { label: 'Goods and Services Tax (GST) / GSTIN Verification', icon: breakdown.gst?.verified === true ? '✅' : breakdown.gst?.verified === null ? '⚠️' : '🚩', detail: breakdown.gst?.message || 'GST not checked', score: null },
        ].map((item, i) => (
          <View key={i} style={styles.findingRow}>
            <Text style={styles.findingIcon}>{item.icon}</Text>
            <View style={styles.findingText}>
              <Text style={styles.findingLabel}>{item.label}</Text>
              <Text style={styles.findingDetail}>{item.detail}</Text>
              {item.score != null && <Text style={styles.findingScore}>Score: {Math.round(item.score * 100)}%</Text>}
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.reviewBtn} onPress={handleHumanReview}>
        <Text style={styles.reviewBtnText}>Request Human Review</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.navigate('Home')}>
        <Text style={styles.homeBtnText}>Back to Home</Text>
      </TouchableOpacity>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statusBanner: { borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 16 },
  statusIcon: { fontSize: 44, marginBottom: 6 },
  statusText: { fontSize: 22, fontWeight: 'bold', letterSpacing: 1 },
  refId: { fontSize: 12, color: '#777', marginTop: 6, fontFamily: 'monospace' },
  reviewNote: { marginTop: 8, fontSize: 13, color: '#e65100', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 12 },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  barBg: { flex: 1, height: 12, backgroundColor: '#eee', borderRadius: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  pct: { fontSize: 16, fontWeight: 'bold', minWidth: 44, textAlign: 'right' },
  confidenceNote: { fontSize: 12, color: '#777' },
  explanation: { fontSize: 14, color: '#444', lineHeight: 22 },
  findingRow: { flexDirection: 'row', marginBottom: 12, gap: 10 },
  findingIcon: { fontSize: 18, marginTop: 1 },
  findingText: { flex: 1 },
  findingLabel: { fontSize: 13, fontWeight: '600', color: '#333' },
  findingDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  findingScore: { fontSize: 11, color: '#999', marginTop: 2 },
  reviewBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#1a237e', marginBottom: 12 },
  reviewBtnText: { color: '#1a237e', fontSize: 15, fontWeight: '600' },
  homeBtn: { backgroundColor: '#1a237e', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  homeBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
})
