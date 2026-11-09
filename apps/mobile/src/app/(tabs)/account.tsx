import { router } from 'expo-router';
import { Linking, View } from 'react-native';

import { RegisterBenefits } from '@/components/register-benefits';
import { AppText, Badge, Button, Card, Notice, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { COMPANY_PHONE, COMPANY_WHATSAPP_URL } from '@/lib/features';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function Account() {
  const { t, lang, setLang } = useI18n();
  const { session, isGuest, isRegistered } = useAuth();

  return (
    <Screen>
      <AppText variant="title">{t('navAccount')}</AppText>
      <Card>
        {isRegistered && session ? (
          <>
            <AppText>{session.user.phone ? `+${session.user.phone.replace(/^\+/, '')}` : session.user.email}</AppText>
            <Button title={t('familyTitle')} onPress={() => router.push('/family')} />
            <Button title={t('logout')} variant="secondary" onPress={() => supabase.auth.signOut()} />
          </>
        ) : (
          <>
            {isGuest && <Badge text={t('guestBadge')} />}
            <Button title={t('loginTitle')} onPress={() => router.push('/login')} />
          </>
        )}
      </Card>
      {!isRegistered && <RegisterBenefits />}
      <Card>
        <AppText variant="heading">{t('clinicsTitle')}</AppText>
        <AppText variant="small">{t('clinicsSubtitle')}</AppText>
        <Button title={t('clinicsTitle')} variant="secondary" onPress={() => router.push('/clinics')} />
      </Card>
      <Card>
        <AppText variant="small">{t('language')}</AppText>
        <Button title={t('switchLang')} variant="secondary" onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} />
      </Card>
      <Card>
        <AppText variant="label">{t('contactUs')}</AppText>
        <AppText variant="small" style={{ writingDirection: 'ltr' }}>{COMPANY_PHONE}</AppText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button title={t('callUs')} variant="secondary" onPress={() => Linking.openURL(`tel:${COMPANY_PHONE}`)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={t('whatsappUs')} variant="secondary" onPress={() => Linking.openURL(COMPANY_WHATSAPP_URL)} />
          </View>
        </View>
      </Card>
      <Notice text={t('partnerNote')} />
      <Notice text={t('safetyNotice')} />
    </Screen>
  );
}
