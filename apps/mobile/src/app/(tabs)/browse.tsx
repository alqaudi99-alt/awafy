import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Badge, Card, ErrorState, Loading, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { availableOffers, matchesSearch, useCategories, useProducts } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';

export default function Browse() {
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const { t, pick, money } = useI18n();
  const [search, setSearch] = useState(params.q ?? '');
  const [categoryId, setCategoryId] = useState<number | null>(params.category ? Number(params.category) : null);
  const categories = useCategories();
  const products = useProducts(categoryId);

  const visible = useMemo(
    () => (products.data ?? []).filter((p) => matchesSearch(p, search)),
    [products.data, search],
  );

  return (
    <Screen>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('searchPlaceholder')}
        placeholderTextColor={Colors.outline}
        accessibilityLabel={t('searchPlaceholder')}
        style={styles.search}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={t('allCategories')} active={categoryId === null} onPress={() => setCategoryId(null)} />
        {(categories.data ?? []).map((c) => (
          <Chip key={c.id} label={pick(c.name_ar, c.name_en)} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
        ))}
      </ScrollView>

      {products.loading ? (
        <Loading />
      ) : products.error ? (
        <ErrorState onRetry={products.reload} />
      ) : (
        visible.map((product) => {
          const best = availableOffers(product)[0];
          return (
            <Pressable
              key={product.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/product/[id]', params: { id: String(product.id) } })}>
              <Card>
                <AppText variant="label">{pick(product.name_ar, product.name_en)}</AppText>
                <View style={styles.row}>
                  <AppText variant="small" style={{ color: Colors.textSecondary }}>
                    {best ? `${t('fromPrice')} ${money(Number(best.price_omr))}` : t('outOfStock')}
                  </AppText>
                  {product.restricted ? <Badge text={t('restrictedBadge')} tone="danger" /> : product.requires_rx && <Badge text={t('rxRequired')} tone="warning" />}
                </View>
              </Card>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}>
      <AppText variant="small" style={[{ color: Colors.textSecondary }, active && { color: Colors.onPrimary, fontWeight: '700' }]}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    color: Colors.text,
    textAlign: 'left',
  },
  chips: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.md,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
});
