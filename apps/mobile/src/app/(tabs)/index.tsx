import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { categoryIcon, Icon, type IconName, ProductRail } from '@/components/store';
import { AppText, Notice } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useCart } from '@/lib/cart';
import { discountPercent, useCategories, useProducts } from '@/lib/catalogue';
import { type TKey, useI18n } from '@/lib/i18n';

type Banner = { title: TKey; body: TKey; icon: IconName; bg: string; fg: string; go: () => void };

export default function Home() {
  const { t, pick, lang } = useI18n();
  const { count } = useCart();
  const categories = useCategories();
  const products = useProducts(null);
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(width, MaxContentWidth);
  const bannerWidth = pageWidth - Spacing.lg * 2;
  const [slide, setSlide] = useState(0);
  const insets = useSafeAreaInsets();

  const cats = useMemo(() => categories.data ?? [], [categories.data]);
  const all = useMemo(() => products.data ?? [], [products.data]);
  const inCats = (...names: string[]) =>
    all.filter((p) => cats.some((c) => c.id === p.category_id && names.includes(c.name_en)));
  // Offers: only products that need no prescription (medicine advertising rules).
  const offers = all.filter((p) => discountPercent(p) !== null);
  const beauty = inCats('Beauty & Cosmetics', 'Skin Care', 'Hair Care');
  const family = inCats('Mothers & Infants', 'Vitamins');
  const everyday = inCats('Fever & Pain', 'Cold & Allergy', 'Stomach & Digestion');

  const banners: Banner[] = [
    { title: 'bnUrgentTitle', body: 'bnUrgentBody', icon: 'moped-outline', bg: Colors.header, fg: '#FFFFFF', go: () => router.push('/browse') },
    { title: 'bnDoctorTitle', body: 'bnDoctorBody', icon: 'stethoscope', bg: Colors.ink, fg: '#FFFFFF', go: () => router.push('/clinics') },
    {
      title: 'bnBeautyTitle',
      body: 'bnBeautyBody',
      icon: 'face-woman-shimmer-outline',
      bg: Colors.apricotSoft,
      fg: Colors.ink,
      go: () => {
        const c = cats.find((x) => x.name_en === 'Beauty & Cosmetics');
        router.push({ pathname: '/browse', params: c ? { category: String(c.id) } : {} });
      },
    },
  ];

  const openCategory = (id: number) => router.push({ pathname: '/browse', params: { category: String(id) } });

  return (
    <View style={styles.root} {...(Platform.OS === 'web' ? { dir: lang === 'ar' ? 'rtl' : 'ltr' } : {})}>
      <View style={{ height: insets.top, backgroundColor: Colors.header }} />
      <View>
        <View style={styles.header}>
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <AppText style={styles.logo}>{t('appName')}</AppText>
              <AppText style={styles.tagline}>{t('brandTagline')}</AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={count > 0 ? `${t('navCart')} (${count})` : t('navCart')}
              onPress={() => router.navigate('/cart')}
              style={styles.cartBtn}>
              <Icon name="cart-outline" size={24} color="#FFFFFF" />
              {count > 0 && (
                <View style={styles.cartDot}>
                  <AppText style={styles.cartDotText}>{count}</AppText>
                </View>
              )}
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="search"
            accessibilityLabel={t('searchPlaceholder')}
            onPress={() => router.push({ pathname: '/browse', params: { focus: '1' } })}
            style={styles.search}>
            <Icon name="magnify" size={22} color={Colors.outline} />
            <AppText style={styles.searchText}>{t('searchPlaceholder')}</AppText>
          </Pressable>
          <View style={styles.deliverRow}>
            <Icon name="map-marker-outline" size={16} color={Colors.primaryContainer} />
            <AppText style={styles.deliverText}>{t('deliverMuscat')}</AppText>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          {process.env.EXPO_PUBLIC_APP_ENV !== 'production' && (
            <View style={styles.pad}>
              <Notice tone="warning" text={t('devBanner')} />
            </View>
          )}

          <View>
            <ScrollView
              horizontal
              pagingEnabled
              snapToInterval={bannerWidth + Spacing.sm}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bannerRow}
              onMomentumScrollEnd={(e) => setSlide(Math.round(Math.abs(e.nativeEvent.contentOffset.x) / (bannerWidth + Spacing.sm)))}>
              {banners.map((b) => (
                <Pressable
                  key={b.title}
                  accessibilityRole="button"
                  onPress={b.go}
                  style={[styles.banner, { width: bannerWidth, backgroundColor: b.bg }]}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <AppText style={[styles.bannerTitle, { color: b.fg }]}>{t(b.title)}</AppText>
                    <AppText style={[styles.bannerBody, { color: b.fg }]}>{t(b.body)}</AppText>
                  </View>
                  <View style={[styles.bannerArt, { backgroundColor: b.fg === '#FFFFFF' ? '#FFFFFF1F' : '#FFFFFF' }]}>
                    <Icon name={b.icon} size={56} color={b.fg === '#FFFFFF' ? '#FFFFFF' : Colors.apricot} />
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.dots} accessible={false}>
              {banners.map((b, i) => (
                <View key={b.title} style={[styles.dot, i === slide && styles.dotOn]} />
              ))}
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            {cats.map((c) => (
              <Pressable key={c.id} accessibilityRole="button" onPress={() => openCategory(c.id)} style={styles.cat}>
                <View style={[styles.catDisc, { backgroundColor: `${c.color ?? Colors.header}1A` }]}>
                  <Icon name={categoryIcon(c)} size={30} color={c.color ?? Colors.header} />
                </View>
                <AppText numberOfLines={2} style={styles.catText}>
                  {pick(c.name_ar, c.name_en)}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>

          <View style={[styles.pad, styles.services]}>
            <Service icon="video-outline" title={t('clinicsTitle')} body={t('svcDoctorBody')} onPress={() => router.push('/clinics')} />
            <Service icon="account-group-outline" title={t('familyTitle')} body={t('svcFamilyBody')} onPress={() => router.push('/family')} />
          </View>

          <ProductRail title={t('railOffers')} products={offers} categories={cats} onSeeAll={() => router.push('/browse')} />
          <ProductRail title={t('railBeauty')} products={beauty} categories={cats} />
          <ProductRail title={t('railFamily')} products={family} categories={cats} />
          <ProductRail title={t('railEveryday')} products={everyday} categories={cats} />

          <View style={styles.pad}>
            <Notice text={t('safetyNotice')} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Service({ icon, title, body, onPress }: { icon: IconName; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.service, pressed && { opacity: 0.85 }]}>
      <View style={styles.serviceIcon}>
        <Icon name={icon} size={24} color={Colors.header} />
      </View>
      <AppText style={styles.serviceTitle}>{title}</AppText>
      <AppText style={styles.serviceBody}>{body}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.mist },
  header: {
    backgroundColor: Colors.header,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  logo: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', lineHeight: 34 },
  tagline: { color: Colors.primaryContainer, fontSize: 13 },
  cartBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.headerDeep },
  cartDot: {
    position: 'absolute',
    top: 4,
    end: 2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: Colors.apricot,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartDotText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    minHeight: 50,
    paddingHorizontal: Spacing.lg,
  },
  searchText: { color: Colors.outline, fontSize: 15, flex: 1 },
  deliverRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deliverText: { color: '#FFFFFF', fontSize: 13 },
  scroll: { paddingBottom: Spacing.xxl },
  page: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.xl, paddingTop: Spacing.lg },
  pad: { paddingHorizontal: Spacing.lg },
  bannerRow: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  banner: {
    minHeight: 148,
    borderRadius: 22,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    overflow: 'hidden',
  },
  bannerTitle: { fontSize: 20, fontWeight: '900', lineHeight: 28 },
  bannerBody: { fontSize: 14, lineHeight: 21, opacity: 0.92 },
  bannerArt: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: Spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.outlineVariant },
  dotOn: { width: 18, backgroundColor: Colors.header },
  catRow: { gap: Spacing.md, paddingHorizontal: Spacing.lg },
  cat: { width: 76, alignItems: 'center', gap: 6 },
  catDisc: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  catText: { fontSize: 12, lineHeight: 16, textAlign: 'center', color: Colors.ink },
  services: { flexDirection: 'row', gap: Spacing.sm },
  service: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
  },
  serviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  serviceTitle: { fontSize: 15, fontWeight: '800', color: Colors.ink },
  serviceBody: { fontSize: 12, lineHeight: 18, color: Colors.textSecondary },
});
