import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DriverDeliveries } from '@/components/driver-deliveries';
import { AppText, Badge, Button, Card, ErrorState, Loading, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { statusLabels, useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Order } from '@/lib/types';

export default function OrdersTab() {
  const { role } = useAuth();
  return role === 'driver' ? <DriverDeliveries /> : <CustomerOrders />;
}

function CustomerOrders() {
  const { t, lang, pick, money } = useI18n();
  const { session } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!session) return;
    setError(false);
    supabase
      .from('orders')
      .select('id, status, total_omr, subtotal_omr, delivery_fee_omr, requires_rx, delivery_address, cancel_reason, created_at, pharmacies(id, name_ar, name_en, delivery_fee_omr)')
      .order('created_at', { ascending: false })
      .returns<Order[]>()
      .then(({ data, error: err }) => (err ? setError(true) : setOrders(data ?? [])));
  }, [session]);

  useFocusEffect(load);

  if (!session) {
    return (
      <Screen>
        <View style={styles.centered}>
          <AppText variant="heading">{t('loginRequired')}</AppText>
          <Button title={t('loginTitle')} onPress={() => router.push('/login')} />
        </View>
      </Screen>
    );
  }
  if (error) return <ErrorState onRetry={load} />;
  if (!orders) return <Loading />;

  return (
    <Screen>
      <AppText variant="title">{t('navOrders')}</AppText>
      {orders.length === 0 && <AppText>{t('noOrders')}</AppText>}
      {orders.map((order) => (
        <Pressable
          key={order.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}>
          <Card>
            <View style={styles.row}>
              <AppText variant="label">
                {t('orderNumber')} #{order.id.slice(0, 8).toUpperCase()}
              </AppText>
              <Badge
                text={statusLabels[lang][order.status]}
                tone={order.status === 'cancelled' ? 'danger' : order.status === 'awaiting_prescription' ? 'warning' : 'info'}
              />
            </View>
            <AppText variant="small" style={{ color: Colors.textSecondary }}>
              {pick(order.pharmacies?.name_ar, order.pharmacies?.name_en)} ·{' '}
              {new Date(order.created_at).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB')}
            </AppText>
            <AppText variant="label">{money(Number(order.total_omr))}</AppText>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  centered: { alignItems: 'center', gap: Spacing.lg, paddingTop: 80 },
});
