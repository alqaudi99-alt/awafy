import { router } from 'expo-router';

import { AppText, Button, Card } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

/** Shown to guests: what they unlock by registering with their phone number. */
export function RegisterBenefits() {
  const { t } = useI18n();
  return (
    <Card>
      <AppText variant="heading">{t('regBenefitsTitle')}</AppText>
      <AppText>{`• ${t('regBenefit1')}`}</AppText>
      <AppText>{`• ${t('regBenefit2')}`}</AppText>
      <AppText>{`• ${t('regBenefit3')}`}</AppText>
      <Button title={t('regCta')} onPress={() => router.push('/login')} />
    </Card>
  );
}
