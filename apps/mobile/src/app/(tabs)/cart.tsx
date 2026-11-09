import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, Notice, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useCart } from '@/lib/cart';
import { useI18n } from '@/lib/i18n';

export default function CartScreen() {
  const { t, pick, money } = useI18n();
  const { cart, subtotal, hasRx, setQuantity, remove } = useCart();

  if (cart.lines.length === 0) {
    return (
      <Screen>
        <View style={styles.empty}>
          <AppText variant="heading">{t('emptyCart')}</AppText>
          <Button title={t('browseNow')} onPress={() => router.navigate('/browse')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText variant="title">{t('navCart')}</AppText>
      <AppText variant="small" style={{ color: Colors.textSecondary }}>
        {t('pharmacy')}: {pick(cart.pharmacyNameAr, cart.pharmacyNameEn)}
      </AppText>

      {cart.lines.map((line) => (
        <Card key={line.productId}>
          <AppText variant="label">{pick(line.nameAr, line.nameEn)}</AppText>
          {line.restricted ? <Badge text={t('restrictedBadge')} tone="danger" /> : line.requiresRx && <Badge text={t('rxRequired')} tone="warning" />}
          <View style={styles.row}>
            <View style={styles.stepper}>
              <Stepper label="−" onPress={() => setQuantity(line.productId, line.quantity - 1)} />
              <AppText variant="label" style={styles.qty} accessibilityLiveRegion="polite">
                {line.quantity}
              </AppText>
              <Stepper label="+" onPress={() => setQuantity(line.productId, line.quantity + 1)} />
            </View>
            <AppText variant="label">{money(line.priceOmr * line.quantity)}</AppText>
          </View>
          <Pressable accessibilityRole="button" onPress={() => remove(line.productId)}>
            <AppText variant="small" style={{ color: Colors.error }}>
              {t('remove')}
            </AppText>
          </Pressable>
        </Card>
      ))}

      {hasRx && <Notice tone="warning" text={t('rxNoteCart')} />}

      <Card>
        <View style={styles.row}>
          <AppText>{t('subtotal')}</AppText>
          <AppText variant="label">{money(subtotal)}</AppText>
        </View>
      </Card>

      <Button
        title={t('checkout')}
        onPress={() => router.push('/checkout')}
      />
    </Screen>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label === '+' ? 'increase' : 'decrease'} onPress={onPress} style={styles.stepBtn}>
      <AppText variant="label" style={{ color: Colors.primary, textAlign: 'center' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: Spacing.lg, paddingTop: 80 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: { minWidth: 24, textAlign: 'center' },
});
