import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Card, Notice, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useCategories } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type Promotion = { id: string; text_ar: string; text_en: string | null; pharmacies: { name_ar: string; name_en: string | null } | null };

export default function Home() {
  const { t, pick } = useI18n();
  const categories = useCategories();
  const [search, setSearch] = useState('');
  const [promotions, setPromotions] = useState<Promotion[]>([]);

  useEffect(() => {
    // Only admin-approved, currently running promotions are returned (enforced by the database).
    supabase
      .from('promotions')
      .select('id, text_ar, text_en, pharmacies(name_ar, name_en)')
      .returns<Promotion[]>()
      .then(({ data }) => setPromotions(data ?? []));
  }, []);

  const submitSearch = () => router.push({ pathname: '/browse', params: { q: search.trim() } });

  return (
    <Screen>
      {process.env.EXPO_PUBLIC_APP_ENV !== 'production' && <Notice tone="warning" text={t('devBanner')} />}

      <View style={styles.hero}>
        <AppText variant="title" style={styles.heroTitle}>
          {t('appName')}
        </AppText>
        <AppText style={styles.heroText}>{t('tagline')}</AppText>
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={submitSearch}
          placeholder={t('searchPlaceholder')}
          placeholderTextColor={Colors.outline}
          returnKeyType="search"
          accessibilityLabel={t('searchPlaceholder')}
          style={styles.search}
        />
      </View>

      <View style={styles.quick}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/clinics')} style={styles.quickItem}>
          <Card style={{ flex: 1 }}>
            <AppText variant="label">{t('clinicsTitle')}</AppText>
          </Card>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/family')} style={styles.quickItem}>
          <Card style={{ flex: 1 }}>
            <AppText variant="label">{t('familyTitle')}</AppText>
          </Card>
        </Pressable>
      </View>

      <AppText variant="heading">{t('categories')}</AppText>
      <View style={styles.grid}>
        {(categories.data ?? []).map((category) => (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/browse', params: { category: String(category.id) } })}
            style={({ pressed }) => [styles.category, pressed && { opacity: 0.8 }]}>
            <AppText variant="label" style={styles.categoryText}>
              {pick(category.name_ar, category.name_en)}
            </AppText>
          </Pressable>
        ))}
      </View>

      {promotions.length > 0 && (
        <>
          <AppText variant="heading">{t('offers')}</AppText>
          {promotions.map((promo) => (
            <Card key={promo.id} style={{ backgroundColor: Colors.goldContainer }}>
              <AppText variant="small" style={{ color: Colors.gold }}>
                {pick(promo.pharmacies?.name_ar, promo.pharmacies?.name_en)}
              </AppText>
              <AppText variant="label">{pick(promo.text_ar, promo.text_en)}</AppText>
            </Card>
          ))}
        </>
      )}

      <Notice text={t('safetyNotice')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', gap: 8 },
  quickItem: { flex: 1 },
  hero: { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.sm },
  heroTitle: { color: Colors.onPrimary },
  heroText: { color: Colors.primaryContainer },
  search: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    color: Colors.text,
    textAlign: 'left',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  category: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 64,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    padding: Spacing.md,
    justifyContent: 'center',
  },
  categoryText: { fontSize: 14, color: Colors.brandDark },
});
