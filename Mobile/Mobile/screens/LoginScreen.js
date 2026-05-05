import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native'
import { login, register } from '../services/api'

export default function LoginScreen({ navigation }) {
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async () => {
    if (!email || !password) { Alert.alert('Error', 'Email and password are required'); return }
    if (isRegister && !name) { Alert.alert('Error', 'Name is required'); return }
    if (password.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters'); return }

    setLoading(true)
    try {
      if (isRegister) {
        await register(name, email, password)
      } else {
        await login(email, password)
      }
      navigation.replace('Home')
    } catch (e) {
      Alert.alert('Error', e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <View style={styles.logoBox}>
          <Text style={styles.logoIcon}>🧾</Text>
          <Text style={styles.logoTitle}>Expense Auditor</Text>
          <Text style={styles.logoSub}>Artificial Intelligence (AI) Powered Receipt Verification</Text>
        </View>

        {isRegister && (
          <>
            <Text style={styles.label}>Full Name</Text>
            <TextInput style={styles.input} placeholder="Enter your name" placeholderTextColor="#999"
              value={name} onChangeText={setName} />
          </>
        )}

        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} placeholder="Enter your email" placeholderTextColor="#999"
          value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} placeholder="Enter your password" placeholderTextColor="#999"
          value={password} onChangeText={setPassword} secureTextEntry />

        <TouchableOpacity style={styles.btn} onPress={handle} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{isRegister ? 'Register' : 'Login'}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsRegister(p => !p)} style={styles.switchBtn}>
          <Text style={styles.switchText}>
            {isRegister ? 'Already have an account? Login' : 'New user? Register'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logoBox: { alignItems: 'center', marginBottom: 36 },
  logoIcon: { fontSize: 56, marginBottom: 8 },
  logoTitle: { fontSize: 24, fontWeight: 'bold', color: '#1a237e' },
  logoSub: { fontSize: 12, color: '#666', marginTop: 4, textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderColor: '#dde3f0', color: '#333' },
  btn: { backgroundColor: '#1a237e', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 28 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  switchBtn: { marginTop: 16, alignItems: 'center' },
  switchText: { color: '#1a237e', fontSize: 14 },
})
