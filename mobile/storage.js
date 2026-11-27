import AsyncStorage from '@react-native-async-storage/async-storage';

const memory = new Map();

export async function readJson(key, fallback = null) {
  try {
    const value = await AsyncStorage.getItem(key);
    if (value != null) return JSON.parse(value);
  } catch {}
  return memory.has(key) ? memory.get(key) : fallback;
}

export async function writeJson(key, value) {
  memory.set(key, value);
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export async function removeJson(key) {
  memory.delete(key);
  try { await AsyncStorage.removeItem(key); } catch {}
}
