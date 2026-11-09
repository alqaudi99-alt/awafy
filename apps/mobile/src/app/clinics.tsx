import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { AppText, Badge, Button, Card, Loading, Notice, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type Clinic = {
  id: string;
  name_ar: string;
  name_en: string | null;
  kind: 'telemedicine' | 'clinic';
  specialties_ar: string | null;
  specialties_en: string | null;
  hours_text: string | null;
  phone: string | null;
  whatsapp: string | null;
  booking_url: string | null;
  governorate: string | null;
};

export default function ClinicsScreen() {
  const { t, pick } = useI18n();
  const [clinics, setClinics] = useState<Clinic[] | null>(null);

  useEffect(() => {
    // Only clinics verified by Awafy are visible (enforced by the database).
    supabase
      .from('clinics')
      .select('id, name_ar, name_en, kind, specialties_ar, specialties_en, hours_text, phone, whatsapp, booking_url, governorate')
      .order('kind', { ascending: false })
      .order('name_ar')
      .then(({ data }) => setClinics((data as Clinic[] | null) ?? []));
  }, []);

  return (
    <Screen>
      <AppText variant="title">{t('clinicsTitle')}</AppText>
      <AppText>{t('clinicsSubtitle')}</AppText>
      {clinics === null && <Loading />}
      {clinics?.length === 0 && <Notice text={t('clinicsEmpty')} />}
      {clinics?.map((c) => (
        <Card key={c.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <AppText variant="label" style={{ flex: 1 }}>
              {pick(c.name_ar, c.name_en)}
            </AppText>
            <Badge text={c.kind === 'telemedicine' ? t('telemedicine') : t('clinic')} />
          </View>
          {pick(c.specialties_ar, c.specialties_en) ? <AppText variant="small">{pick(c.specialties_ar, c.specialties_en)}</AppText> : null}
          {c.hours_text ? <AppText variant="small">{`${t('hours')}: ${c.hours_text}`}</AppText> : null}
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {c.booking_url && (
              <View style={{ flex: 1 }}>
                <Button title={t('bookNow')} onPress={() => Linking.openURL(c.booking_url!)} />
              </View>
            )}
            {c.whatsapp && (
              <View style={{ flex: 1 }}>
                <Button title={t('whatsappUs')} variant="secondary" onPress={() => Linking.openURL(`https://wa.me/${c.whatsapp!.replace(/\D/g, '')}`)} />
              </View>
            )}
            {c.phone && (
              <View style={{ flex: 1 }}>
                <Button title={t('callUs')} variant="secondary" onPress={() => Linking.openURL(`tel:${c.phone}`)} />
              </View>
            )}
          </View>
        </Card>
      ))}
    </Screen>
  );
}
