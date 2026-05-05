import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import Constants from "expo-constants";

const apiBase =
  (process.env.EXPO_PUBLIC_API_BASE as string | undefined) ??
  (Constants.expoConfig?.extra?.apiBase as string | undefined) ??
  "http://localhost:8080/api";

export const api = axios.create({
  baseURL: apiBase,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("jwt");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function setToken(token: string) {
  await AsyncStorage.setItem("jwt", token);
}

export async function getToken() {
  return await AsyncStorage.getItem("jwt");
}

export async function clearToken() {
  await AsyncStorage.removeItem("jwt");
  await AsyncStorage.removeItem("user_profile");
}

export async function saveUserProfile(user: any) {
  await AsyncStorage.setItem("user_profile", JSON.stringify(user));
}

export async function loadUserProfile(): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem("user_profile");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
