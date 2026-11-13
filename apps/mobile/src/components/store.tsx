import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useCart } from '@/lib/cart';
import { availableOffers, discountPercent } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';
import type { Category, ProductWithOffers } from '@/lib/types';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color = Colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} accessible={false} />;
}

const FALLBACK_ICON: IconName = 'medical-bag';

export function categoryIcon(c?: Pick<Category, 'icon'> | null): IconName {
  return ((c?.icon as IconName | null) ?? FALLBACK_ICON) as IconName;
}

/** Product picture, or a tinted tile with the category's icon until real photos are added. */
export function ProductImage({
  product,
  category,
  size = 'card',
}: {
  product: Pick<ProductWithOffers, 'image_url'>;
  category?: Category | null;
  size?: 'card' | 'hero';
}) {
  const tint = category?.color ?? Colors.header;
  const height = size === 'hero' ? 220 : 118;
  if (product.image_url) {
    return <Image source={{ uri: product.image_url }} style={[styles.image, { height }]} contentFit="contain" accessible={false} />;
  }
  return (
    <View style={[styles.image, { height, backgroundColor: `${tint}14` }]}>
      <View style={[styles.blob, { backgroundColor: `${tint}22`, width: height * 0.72, height: height * 0.72 }]} />
      <Icon name={categoryIcon(category)} size={size === 'hero' ? 96 : 52} color={tint} />
    </View>
  );
}

/** Marketplace product card: picture, saving, name, price, quick add. */
export function ProductCard({
  product,
  category,
  style,
}: {
  product: ProductWithOffers;
  category?: Category | null;
  style?: StyleProp<ViewStyle>;
}) {
  const { t, pick, money } = useI18n();
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const offers = availableOffers(product);
  const best = offers[0];
  const off = discountPercent(product);
  const name = pick(product.name_ar, product.name_en);

  const quickAdd = () => {
    if (!best?.pharmacies) return;
    // A cart holds one pharmacy; when it would mix pharmacies, let the product page explain the choice.
    if (product.restricted || add(best.pharmacies, {
      productId: product.id,
      nameAr: product.name_ar,
      nameEn: product.name_en,
      priceOmr: Number(best.price_omr),
      requiresRx: product.requires_rx,
      restricted: product.restricted,
    }) === 'different_pharmacy') {
      router.push({ pathname: '/product/[id]', params: { id: String(product.id) } });
      return;
    }
    setAdded(true);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}${best ? `، ${money(Number(best.price_omr))}` : ''}`}
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: String(product.id) } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, style]}>
      <View>
        <ProductImage product={product} category={category} />
        {off ? (
          <View style={styles.offBadge}>
            <AppText style={styles.offText}>{`-${off}%`}</AppText>
          </View>
        ) : null}
        {product.requires_rx && (
          <View style={[styles.rxBadge, product.restricted && { backgroundColor: Colors.error }]}>
            <AppText style={styles.rxText}>{product.restricted ? t('restrictedShort') : t('rxShort')}</AppText>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <AppText numberOfLines={2} style={styles.name}>
          {name}
        </AppText>
        {best ? (
          <View style={styles.priceRow}>
            <View style={{ flex: 1 }}>
              <AppText style={styles.price}>{money(Number(best.price_omr))}</AppText>
              {off && best.compare_at_price_omr ? (
                <AppText style={styles.was}>{money(Number(best.compare_at_price_omr))}</AppText>
              ) : (
                <AppText style={styles.meta}>{offers.length > 1 ? t('fromPharmacies').replace('{n}', String(offers.length)) : ' '}</AppText>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('addToCart')}: ${name}`}
              onPress={quickAdd}
              hitSlop={8}
              style={[styles.addBtn, added && { backgroundColor: Colors.primary }]}>
              <Icon name={added ? 'check' : 'plus'} size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <AppText style={styles.meta}>{t('outOfStock')}</AppText>
        )}
      </View>
    </Pressable>
  );
}

/** A titled horizontal row of products with a "see all" link. */
export function ProductRail({
  title,
  products,
  categories,
  onSeeAll,
}: {
  title: string;
  products: ProductWithOffers[];
  categories: Category[];
  onSeeAll?: () => void;
}) {
  const { t } = useI18n();
  if (products.length === 0) return null;
  return (
    <View style={styles.rail}>
      <View style={styles.railHead}>
        <View style={{ flex: 1 }}>
          <AppText style={styles.railTitle}>{title}</AppText>
        </View>
        {onSeeAll && (
          <Pressable accessibilityRole="link" onPress={onSeeAll} hitSlop={8}>
            <AppText style={styles.seeAll}>{t('seeAll')}</AppText>
          </Pressable>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railRow}>
        {products.map((p) => (
          <ProductCard key={p.id} product={p} category={categories.find((c) => c.id === p.category_id)} style={{ width: 156 }} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 999 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
  },
  cardBody: { gap: 6, paddingHorizontal: 2 },
  name: { fontSize: 14, lineHeight: 20, minHeight: 40, color: Colors.ink },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  price: { fontSize: 16, fontWeight: '800', color: Colors.ink },
  was: { fontSize: 12, color: Colors.outline, textDecorationLine: 'line-through' },
  meta: { fontSize: 12, color: Colors.textSecondary },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offBadge: {
    position: 'absolute',
    top: 6,
    start: 6,
    backgroundColor: Colors.apricot,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  offText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', writingDirection: 'ltr' },
  rxBadge: {
    position: 'absolute',
    top: 6,
    end: 6,
    backgroundColor: Colors.ink,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rxText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  rail: { gap: Spacing.sm },
  railHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg },
  railTitle: { fontSize: 18, fontWeight: '800', color: Colors.ink },
  seeAll: { fontSize: 14, fontWeight: '700', color: Colors.header },
  railRow: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
});
