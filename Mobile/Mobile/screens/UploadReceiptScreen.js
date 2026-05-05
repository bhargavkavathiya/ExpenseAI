import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { submitExpense } from '../services/api'

const CATEGORIES = ['Food', 'Travel', 'Hotel', 'Office', 'Medical', 'Other']

export default function UploadReceiptScreen({ navigation }) {
  const [image, setImage] = useState(null)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { Alert.alert('Permission required', 'Please allow photo access'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
    if (!result.canceled) setImage(result.assets[0].uri)
  }

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) { Alert.alert('Permission required', 'Please allow camera access'); return }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 })
    if (!result.canceled) setImage(result.assets[0].uri)
  }

  const handleSubmit = async () => {
    if (!image) { Alert.alert('Missing Receipt', 'Please upload or take a photo of your receipt'); return }
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) { Alert.alert('Invalid Amount', 'Please enter a valid amount greater than zero'); return }
    if (!category) { Alert.alert('Missing Category', 'Please select a category'); return }

    setLoading(true)
    try {
      const result = await submitExpense(image, parseFloat(amount), category, description, new Date().toISOString().split('T')[0])
      navigation.navigate('Acknowledgement', { result })
    } catch (e) {
      Alert.alert('Submission Failed', e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Submit Expense</Text>
      <Text style={styles.subtitle}>Upload receipt for Artificial Intelligence (AI) audit</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Receipt Photo</Text>
        {image
          ? <Image source={{ uri: image }} style={styles.receiptImage} />
          : <View style={styles.placeholder}><Text style={styles.placeholderIcon}>📄</Text><Text style={styles.placeholderText}>No receipt selected</Text></View>
        }
        <View style={styles.imageButtons}>
          <TouchableOpacity style={styles.imageBtn} onPress={takePhoto}>
            <Text style={styles.imageBtnText}>📷 Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.imageBtn, styles.imageBtnOutline]} onPress={pickImage}>
            <Text style={[styles.imageBtnText, styles.outlineText]}>🖼 Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Expense Details</Text>
        <Text style={styles.label}>Amount (₹)</Text>
        <TextInput style={styles.input} placeholder="e.g. 1500" placeholderTextColor="#999"
          value={amount} onChangeText={setAmount} keyboardType="numeric" />

        <Text style={styles.label}>Category</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity key={cat} style={[styles.chip, category === cat && styles.chipActive]} onPress={() => setCategory(cat)}>
              <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput style={[styles.input, styles.textArea]} placeholder="Brief description"
          placeholderTextColor="#999" value={description} onChangeText={setDescription} multiline numberOfLines={3} />
      </View>

      {loading
        ? <View style={styles.loadingBox}><ActivityIndicator size="large" color="#1a237e" /><Text style={styles.loadingText}>AI (Artificial Intelligence) is analyzing your receipt...</Text></View>
        : <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}><Text style={styles.submitBtnText}>Submit for AI Audit</Text></TouchableOpacity>
      }
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a237e', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#666', marginBottom: 20 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 12 },
  receiptImage: { width: '100%', height: 200, borderRadius: 10, marginBottom: 12, resizeMode: 'cover' },
  placeholder: { height: 150, backgroundColor: '#f5f7ff', borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#dde3f0', borderStyle: 'dashed' },
  placeholderIcon: { fontSize: 40 },
  placeholderText: { color: '#aaa', marginTop: 8, fontSize: 13 },
  imageButtons: { flexDirection: 'row', gap: 10 },
  imageBtn: { flex: 1, backgroundColor: '#1a237e', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  imageBtnOutline: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#1a237e' },
  imageBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  outlineText: { color: '#1a237e' },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: '#f5f7ff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: '#dde3f0', color: '#333' },
  textArea: { height: 80, textAlignVertical: 'top' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f0f4ff', borderWidth: 1, borderColor: '#dde3f0' },
  chipActive: { backgroundColor: '#1a237e', borderColor: '#1a237e' },
  chipText: { fontSize: 13, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  loadingBox: { alignItems: 'center', paddingVertical: 20 },
  loadingText: { marginTop: 12, color: '#1a237e', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  submitBtn: { backgroundColor: '#1a237e', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
})
