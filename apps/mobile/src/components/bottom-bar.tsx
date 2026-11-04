import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useI18n, type TKey } from '@/lib/i18n';

import { AppText } from './ui';

const TABS: { href: '/' | '/browse' | '/cart' | '/orders' | '/account'; label: TKey; icon: string }[] = [
  { href: '/', label: 'navHome', icon: '⌂' },
  { href: '/browse', label: 'navBrowse', icon: '⌕' },
  { href: '/cart', label: 'navCart', icon: '🛒' },
  { href: '/orders', label: 'navOrders', icon: '☰' },
  { href: '/account', label: 'navAccount', icon: '◉' },
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
        const base = tab.href === '/orders' && role === 'driver' ? t('navDeliveries') : t(tab.label);
        const label = tab.href === '/cart' && count > 0 ? `${base} (${count})` : base;
        return (
          <Pressable
            key={tab.href}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            onPress={() => router.navigate(tab.href)}
            style={styles.tab}>
            <View style={[styles.pill, active && styles.pillActive]}>
              <AppText style={[styles.icon, active && styles.activeText]} accessible={false}>
                {tab.icon}
              </AppText>
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
  pillActive: { backgroundColor: Colors.primaryContainer },
  icon: { fontSize: 18, textAlign: 'center', color: Colors.textSecondary },
  label: { textAlign: 'center', color: Colors.textSecondary },
  activeText: { color: Colors.brandDark, fontWeight: '700' },
});
