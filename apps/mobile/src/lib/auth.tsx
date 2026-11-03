import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

type AuthValue = { session: Session | null; ready: boolean };

const AuthContext = createContext<AuthValue>({ session: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ session, ready }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Normalises an Omani mobile number to E.164 (+968XXXXXXXX). Returns null if invalid. */
export function toOmanE164(input: string): string | null {
  const digits = input.replace(/\D/g, '').replace(/^00/, '');
  const local = digits.startsWith('968') ? digits.slice(3) : digits;
  // Omani mobile numbers are 8 digits starting with 7 or 9.
  return /^[79]\d{7}$/.test(local) ? `+968${local}` : null;
}
