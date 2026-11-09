import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { MemberDose } from '@/components/member-dose';
import { AppText, Badge, Button, Card, ErrorState, Loading, Notice, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useCart } from '@/lib/cart';
import { availableOffers, useProduct } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';
import type { Offer, ProductWithOffers } from '@/lib/types';

/** Cross-platform confirm dialog (Alert has no buttons on web). */
function confirm(title: string, message: string, ok: string, cancel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, pick, money } = useI18n();
  const { add } = useCart();
  const product = useProduct(Number(id));
  const [addedFrom, setAddedFrom] = useState<string | null>(null);

  if (product.loading) return <Loading />;
  if (product.error || !product.data) return <ErrorState onRetry={product.reload} />;
  const p: ProductWithOffers = product.data;
  const offers = availableOffers(p);

  const addOffer = async (offer: Offer) => {
    if (!offer.pharmacies) return;
    const line = {
      productId: p.id,
      nameAr: p.name_ar,
      nameEn: p.name_en,
      priceOmr: Number(offer.price_omr),
      requiresRx: p.requires_rx,
    };
    if (add(offer.pharmacies, line) === 'different_pharmacy') {
      const ok = await confirm(t('replaceCartTitle'), t('replaceCartBody'), t('replace'), t('cancel'));
      if (!ok) return;
      add(offer.pharmacies, line, { replace: true });
    }
    setAddedFrom(offer.pharmacy_id);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: pick(p.name_ar, p.name_en) }} />
      <AppText variant="title">{pick(p.name_ar, p.name_en)}</AppText>
      {p.requires_rx && <Badge text={t('rxRequired')} tone="warning" />}

      {(p.usage_ar || p.usage_en) && (
        <Card>
          <AppText variant="small" style={{ color: Colors.textSecondary }}>
            {t('usage')}
          </AppText>
          <AppText>{pick(p.usage_ar, p.usage_en)}</AppText>
        </Card>
      )}

      <MemberDose productId={p.id} />

      <AppText variant="heading">{t('compareOffers')}</AppText>
      {offers.length === 0 && <AppText>{t('outOfStock')}</AppText>}
      {offers.map((offer, index) => (
        <Card key={offer.pharmacy_id} style={index === 0 && styles.best}>
          <View style={styles.row}>
            <AppText variant="label" style={{ flex: 1 }}>
              {pick(offer.pharmacies?.name_ar, offer.pharmacies?.name_en)}
            </AppText>
            <AppText variant="label" style={{ color: Colors.primary }}>
              {money(Number(offer.price_omr))}
            </AppText>
          </View>
          <Button
            title={addedFrom === offer.pharmacy_id ? `✓ ${t('added')}` : t('addToCart')}
            variant={index === 0 ? 'primary' : 'secondary'}
            onPress={() => addOffer(offer)}
          />
        </Card>
      ))}

      {addedFrom && <Button title={t('navCart')} variant="secondary" onPress={() => router.navigate('/cart')} />}
      <Notice text={t('safetyNotice')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  best: { borderColor: Colors.primary, borderWidth: 2 },
});
