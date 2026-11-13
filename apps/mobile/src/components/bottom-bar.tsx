import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { DELIVERY_ENABLED } from '@/lib/features';
import { useI18n, type TKey } from '@/lib/i18n';

import { Icon, type IconName } from './store';
import { AppText } from './ui';

const TABS: { href: '/' | '/browse' | '/cart' | '/orders' | '/account'; label: TKey; icon: IconName; iconOn: IconName }[] = [
  { href: '/', label: 'navHome', icon: 'home-outline', iconOn: 'home' },
  { href: '/browse', label: 'navBrowse', icon: 'view-grid-outline', iconOn: 'view-grid' },
  { href: '/cart', label: 'navCart', icon: 'cart-outline', iconOn: 'cart' },
  { href: '/orders', label: 'navOrders', icon: 'receipt-text-outline', iconOn: 'receipt-text' },
  { href: '/account', label: 'navAccount', icon: 'account-circle-outline', iconOn: 'account-circle' },
];

export function BottomBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { count } = useCart();
  const { role } = useAuth();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        const base = tab.href === '/orders' && DELIVERY_ENABLED && role === 'driver' ? t('navDeliveries') : t(tab.label);
        const label = base;
        const a11y = tab.href === '/cart' && count > 0 ? `${base} (${count})` : base;
        return (
          <Pressable
            key={tab.href}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={a11y}
            onPress={() => router.navigate(tab.href)}
            style={styles.tab}>
            <View style={[styles.pill, active && styles.pillActive]}>
              <Icon name={active ? tab.iconOn : tab.icon} size={24} color={active ? Colors.header : Colors.textSecondary} />
              {tab.href === '/cart' && count > 0 && (
                <View style={styles.badge}>
                  <AppText style={styles.badgeText}>{count}</AppText>
                </View>
              )}
            </View>
            <AppText variant="small" style={[styles.label, active && styles.activeText]} numberOfLines={1}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.outlineVariant,
    paddingTop: Spacing.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48 },
  pill: { paddingHorizontal: Spacing.lg, paddingVertical: 2, borderRadius: 16 },
  pillActive: { backgroundColor: Colors.secondaryContainer },
  badge: {
    position: 'absolute',
    top: -4,
    end: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Colors.apricot,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  label: { textAlign: 'center', color: Colors.textSecondary },
  activeText: { color: Colors.header, fontWeight: '800' },
});
