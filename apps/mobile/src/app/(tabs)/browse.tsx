import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { categoryIcon, Icon, ProductCard } from '@/components/store';
import { AppText, ErrorState, Loading } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { discountPercent, matchesSearch, useCategories, useProducts } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';

type Sort = 'relevance' | 'price' | 'offers';

export default function Browse() {
  const params = useLocalSearchParams<{ q?: string; category?: string; focus?: string }>();
  const { t, pick, lang } = useI18n();
  const [search, setSearch] = useState(params.q ?? '');
  const [categoryId, setCategoryId] = useState<number | null>(params.category ? Number(params.category) : null);
  const [sort, setSort] = useState<Sort>('relevance');
  const categories = useCategories();
  const products = useProducts(categoryId);
  const { width } = useWindowDimensions();
  const columns = Math.min(width, MaxContentWidth) >= 560 ? 3 : 2;
  const cats = categories.data ?? [];

  const visible = useMemo(() => {
    const list = (products.data ?? []).filter((p) => matchesSearch(p, search));
    const price = (p: (typeof list)[number]) => Math.min(...p.pharmacy_stock.filter((o) => o.quantity > 0).map((o) => Number(o.price_omr)), Infinity);
    if (sort === 'price') return [...list].sort((a, b) => price(a) - price(b));
    if (sort === 'offers') return list.filter((p) => discountPercent(p) !== null);
    return list;
  }, [products.data, search, sort]);

  return (
    <View style={styles.root} {...(Platform.OS === 'web' ? { dir: lang === 'ar' ? 'rtl' : 'ltr' } : {})}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.header }}>
        <View style={styles.header}>
          <View style={styles.search}>
            <Icon name="magnify" size={22} color={Colors.outline} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              autoFocus={params.focus === '1'}
              placeholder={t('searchPlaceholder')}
              placeholderTextColor={Colors.outline}
              accessibilityLabel={t('searchPlaceholder')}
              returnKeyType="search"
              style={[styles.searchInput, { textAlign: lang === 'ar' ? 'right' : 'left' }]}
            />
            {search ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('clearSearch')} onPress={() => setSearch('')} hitSlop={8}>
                <Icon name="close-circle" size={20} color={Colors.outline} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.page}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label={t('allCategories')} icon="view-grid-outline" active={categoryId === null} onPress={() => setCategoryId(null)} />
            {cats.map((c) => (
              <Chip
                key={c.id}
                label={pick(c.name_ar, c.name_en)}
                icon={categoryIcon(c)}
                active={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
          </ScrollView>

          <View style={styles.toolbar}>
            <AppText style={styles.count}>{products.loading ? ' ' : t('resultsCount').replace('{n}', String(visible.length))}</AppText>
            <View style={styles.sorts}>
              {(['relevance', 'price', 'offers'] as Sort[]).map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sort === s }}
                  onPress={() => setSort(s)}
                  style={[styles.sort, sort === s && styles.sortOn]}>
                  <AppText style={[styles.sortText, sort === s && { color: Colors.header, fontWeight: '800' }]}>
                    {t(s === 'relevance' ? 'sortRelevance' : s === 'price' ? 'sortPrice' : 'sortOffers')}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>

          {products.loading ? (
            <Loading />
          ) : products.error ? (
            <ErrorState onRetry={products.reload} />
          ) : visible.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="magnify-close" size={48} color={Colors.outline} />
              <AppText style={styles.emptyText}>{t('noResults')}</AppText>
            </View>
          ) : (
            <View style={styles.grid}>
              {visible.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  category={cats.find((c) => c.id === p.category_id)}
                  style={{ width: `${100 / columns - 2.5}%` }}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Chip({ label, icon, active, onPress }: { label: string; icon: Parameters<typeof Icon>[0]['name']; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}>
      <Icon name={icon} size={16} color={active ? '#FFFFFF' : Colors.header} />
      <AppText style={[styles.chipText, active && { color: '#FFFFFF', fontWeight: '800' }]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.mist },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    minHeight: 50,
    paddingHorizontal: Spacing.lg,
  },
  searchInput: { flex: 1, fontSize: 16, color: Colors.text, minHeight: 48 },
  scroll: { paddingBottom: Spacing.xxl },
  page: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.md, paddingTop: Spacing.md },
  chips: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    minHeight: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  chipActive: { backgroundColor: Colors.header, borderColor: Colors.header },
  chipText: { fontSize: 13, color: Colors.ink },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  count: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  sorts: { flexDirection: 'row', gap: 4 },
  sort: { paddingHorizontal: 10, minHeight: 32, justifyContent: 'center', borderRadius: Radius.pill },
  sortOn: { backgroundColor: Colors.secondaryContainer },
  sortText: { fontSize: 13, color: Colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  empty: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl },
  emptyText: { color: Colors.textSecondary },
});
