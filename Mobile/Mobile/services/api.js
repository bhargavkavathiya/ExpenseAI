import AsyncStorage from '@react-native-async-storage/async-storage'

// localhost.run SSH tunnel — phone (on mobile data) reaches laptop API via public URL
// If the SSH tunnel disconnects, the URL changes — update here
const BASE_URL = 'https://all-worms-cut.loca.lt/api'

async function getHeaders(multipart = false) {
  const token = await AsyncStorage.getItem('token')
  const headers = { 'ngrok-skip-browser-warning': 'true' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!multipart) headers['Content-Type'] = 'application/json'
  return headers
}

export async function register(name, email, password) {
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify({ 
      email, 
      password,
      profile: { fullName: name }
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || data.detail || 'Registration failed')
  await AsyncStorage.setItem('token', data.accessToken)
  return data
}

export async function login(email, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || data.detail || 'Login failed')
  await AsyncStorage.setItem('token', data.accessToken)
  const u = data.user
  await AsyncStorage.setItem('user', JSON.stringify({ 
    id: u.id, 
    name: u.profile?.fullName || u.email, 
    email: u.email, 
    role: u.roles[0] 
  }))
  return data
}

export async function submitExpense(imageUri, amount, category, description, date) {
  const headers = await getHeaders(true)
  const formData = new FormData()
  formData.append('receipt', { uri: imageUri, type: 'image/jpeg', name: 'receipt.jpg' })
  formData.append('claimedAmount', String(amount))
  formData.append('category', category)
  formData.append('purpose', description)
  formData.append('claimedDate', date)

  const res = await fetch(`${BASE_URL}/expenses`, {
    method: 'POST',
    headers,
    body: formData,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || data.detail || 'Submission failed')
  return data
}

export async function getExpense(refId) {
  const headers = await getHeaders()
  const res = await fetch(`${BASE_URL}/expenses/${refId}`, { headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || data.detail || 'Not found')
  return data
}

export async function getMyExpenses() {
  const headers = await getHeaders()
  const res = await fetch(`${BASE_URL}/expenses`, { headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || data.detail || 'Failed to load')
  return data
}

export async function requestHumanReview(refId) {
  const headers = await getHeaders()
  const res = await fetch(`${BASE_URL}/expenses/${refId}/review`, { method: 'POST', headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || data.detail || 'Failed')
  return data
}

export async function logout() {
  await AsyncStorage.removeItem('token')
  await AsyncStorage.removeItem('user')
}
