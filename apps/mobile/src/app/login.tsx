import { router } from 'expo-router';
import { useState } from 'react';

import { AppText, Button, Field, Notice, Screen } from '@/components/ui';
import { toOmanE164, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { friendlyError, supabase } from '@/lib/supabase';

export default function Login() {
  const { t } = useI18n();
  const { isGuest } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const e164 = toOmanE164(phone);
    if (!e164) return setError(t('invalidPhone'));
    setBusy(true);
    setError(null);
    // A guest who registers keeps their orders: we attach the phone to the same account.
    const { error: err } = isGuest
      ? await supabase.auth.updateUser({ phone: e164 })
      : await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (err) return setError(friendlyError(err, t('loadError')));
    setSentTo(e164);
  };

  const verify = async () => {
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ phone: sentTo, token: code.trim(), type: isGuest ? 'phone_change' : 'sms' });
    setBusy(false);
    if (err) return setError(friendlyError(err, t('loadError')));
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Screen>
      <AppText variant="title">{t('loginTitle')}</AppText>
      <AppText>{t('loginSubtitle')}</AppText>
      {!sentTo ? (
        <>
          <Field
            label={t('phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="9XXXXXXX"
          />
          <Button title={t('sendCode')} loading={busy} onPress={sendCode} />
        </>
      ) : (
        <>
          <AppText variant="small">{sentTo}</AppText>
          <Field
            label={t('code')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <Button title={t('verify')} loading={busy} disabled={code.trim().length < 6} onPress={verify} />
        </>
      )}
      {error && <Notice tone="warning" text={error} />}
    </Screen>
  );
}
