// localStorage is still used for non-sensitive preferences (language, cart).
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { secureSessionStorage } from './secure-storage';

// Publishable values only. Data is protected by Row Level Security in the database.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example)');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: secureSessionStorage, // encrypted on phones (security review #11)
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Turns database/network errors into a short message safe to show the customer. */
export function friendlyError(error: unknown, fallback: string): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  // Messages raised by our own database functions are written for people; pass those through.
  if (/required|not available|not found|not allowed|cannot|Login/i.test(message) && message.length < 160) {
    return message;
  }
  return fallback;
}
