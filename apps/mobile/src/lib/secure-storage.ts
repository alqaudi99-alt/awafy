import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Login-session storage for Supabase.
 * - iPhone/Android: encrypted (Keychain / Android Keystore). Values are split into chunks because
 *   some iOS versions reject keychain values above ~2 KB and a session token can be larger.
 * - Web: the browser's localStorage (the only option in a browser).
 */
const CHUNK = 1800;
const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function getNative(key: string): Promise<string | null> {
  const base = safeKey(key);
  const count = Number(await SecureStore.getItemAsync(`${base}.n`, opts));
  if (!count) return null;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(`${base}.${i}`, opts);
    if (part === null) return null; // incomplete write: treat as signed out
    parts.push(part);
  }
  return parts.join('');
}

async function removeNative(key: string): Promise<void> {
  const base = safeKey(key);
  const count = Number(await SecureStore.getItemAsync(`${base}.n`, opts)) || 0;
  await SecureStore.deleteItemAsync(`${base}.n`, opts);
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${base}.${i}`, opts);
}

async function setNative(key: string, value: string): Promise<void> {
  await removeNative(key);
  const base = safeKey(key);
  const count = Math.ceil(value.length / CHUNK);
  for (let i = 0; i < count; i++) {
    await SecureStore.setItemAsync(`${base}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), opts);
  }
  await SecureStore.setItemAsync(`${base}.n`, String(count), opts); // written last = commit marker
}

export const secureSessionStorage = {
  getItem: (key: string) =>
    Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null) : getNative(key),
  setItem: (key: string, value: string) =>
    Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.setItem(key, value)) : setNative(key, value),
  removeItem: (key: string) =>
    Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.removeItem(key)) : removeNative(key),
};
