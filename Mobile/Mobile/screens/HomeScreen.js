import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { getMyExpenses, logout } from '../services/api'

const STATUS_COLORS = { approved: '#2e7d32', rejected: '#c62828', needs_review: '#e65100', processing: '#1565c0' }
const STATUS_ICONS = { approved: '✅', rejected: '❌', needs_review: '⏳', processing: '🔄' }

export default function HomeScreen({ navigation }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await getMyExpenses()
      setExpenses(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleLogout = async () => {
    await logout()
    navigation.replace('Login')
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1a237e" /></View>

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Expenses</Text>
          <Text style={styles.headerSub}>Artificial Intelligence (AI) Expense Auditor</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={item => item._id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No expenses yet. Submit your first receipt!</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Result', { result: item.ai_result, refId: item.ref_id })}>
            <View style={styles.cardRow}>
              <Text style={styles.refId}>{item.ref_id}</Text>
              <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLORS[item.status] }]}>
                  {STATUS_ICONS[item.status]} {item.status?.replace('_', ' ').toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.amount}>₹{item.amount} — {item.category}</Text>
            <Text style={styles.date}>{new Date(item.submitted_at).toLocaleDateString('en-IN')}</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('Upload')}>
        <Text style={styles.fabText}>+ Submit Expense</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#1a237e', padding: 20, paddingTop: 50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  headerSub: { fontSize: 11, color: '#9fa8da', marginTop: 2 },
  logoutBtn: { padding: 8 },
  logoutText: { color: '#9fa8da', fontSize: 13 },
  list: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  refId: { fontFamily: 'monospace', fontSize: 13, color: '#1a237e', fontWeight: '600' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  amount: { fontSize: 15, color: '#333', fontWeight: '500' },
  date: { fontSize: 12, color: '#999', marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#999', textAlign: 'center', fontSize: 14 },
  fab: { position: 'absolute', bottom: 24, left: 24, right: 24, backgroundColor: '#1a237e', borderRadius: 14, paddingVertical: 16, alignItems: 'center', shadowColor: '#1a237e', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  fabText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
})
