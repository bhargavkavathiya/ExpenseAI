import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

export default function AcknowledgementScreen({ navigation, route }) {
  const { result } = route.params

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon}>✅</Text>
        <Text style={styles.title}>Submission Successful</Text>
        <Text style={styles.subtitle}>
          Your expense receipt has been submitted for Artificial Intelligence (AI) audit.
        </Text>

        <View style={styles.refBox}>
          <Text style={styles.refLabel}>Reference ID (Ref ID)</Text>
          <Text style={styles.refId}>{result?.ref_id || result?.expense_id}</Text>
          <Text style={styles.refNote}>Save this ID to track your submission</Text>
        </View>

        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>Current Status</Text>
          <Text style={styles.statusValue}>{result?.status?.replace('_', ' ').toUpperCase()}</Text>
        </View>

        <TouchableOpacity style={styles.resultBtn}
          onPress={() => navigation.navigate('Result', { result, refId: result?.ref_id })}>
          <Text style={styles.resultBtnText}>View AI Audit Result</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 28, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a237e', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  refBox: { backgroundColor: '#f0f4ff', borderRadius: 12, padding: 16, marginTop: 24, width: '100%', alignItems: 'center' },
  refLabel: { fontSize: 12, color: '#666', marginBottom: 6 },
  refId: { fontSize: 18, fontWeight: 'bold', color: '#1a237e', fontFamily: 'monospace' },
  refNote: { fontSize: 11, color: '#999', marginTop: 6 },
  statusBox: { marginTop: 16, alignItems: 'center' },
  statusLabel: { fontSize: 12, color: '#666' },
  statusValue: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 4 },
  resultBtn: { backgroundColor: '#1a237e', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginTop: 28, width: '100%', alignItems: 'center' },
  resultBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  homeBtn: { marginTop: 12, width: '100%', alignItems: 'center', paddingVertical: 12 },
  homeBtnText: { color: '#1a237e', fontSize: 14 },
})
