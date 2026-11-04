import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { statusLabels, useI18n } from '@/lib/i18n';
import { friendlyError, supabase } from '@/lib/supabase';
import type { OrderStatus } from '@/lib/types';

import { AppText, Badge, Button, Card, ErrorState, Loading, Notice, Screen } from './ui';

type Delivery = {
  id: string;
  status: OrderStatus;
  total_omr: number;
  delivery_address: string;
  customer_id: string;
  pharmacies: { name_ar: string; name_en: string | null; phone: string | null } | null;
};

/** Driver view: only address, contact, amount to collect and status (no medicines are shown). */
export function DriverDeliveries() {
  const { t, lang, pick, money } = useI18n();
  const { session } = useAuth();
  const [rows, setRows] = useState<Delivery[] | null>(null);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const { data, error: err } = await supabase
      .from('orders')
      .select('id, status, total_omr, delivery_address, customer_id, pharmacies(name_ar, name_en, phone)')
      .eq('driver_id', session.user.id)
      .in('status', ['accepted', 'preparing', 'out_for_delivery'])
      .order('created_at')
      .returns<Delivery[]>();
    if (err) return setError(true);
    setError(false);
    setRows(data ?? []);
    const ids = [...new Set((data ?? []).map((d) => d.customer_id))];
    if (ids.length) {
      const { data: people } = await supabase.from('profiles').select('id, phone, full_name').in('id', ids);
      setPhones(Object.fromEntries((people ?? []).map((p) => [p.id, p.phone ?? ''])));
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`driver-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `driver_id=eq.${session.user.id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, load]);

  const delivered = async (id: string) => {
    setBusy(id);
    setMessage(null);
    const { error: err } = await supabase.rpc('set_order_status', { p_order_id: id, p_status: 'delivered' });
    setBusy(null);
    if (err) setMessage(friendlyError(err, t('loadError')));
    load();
  };

  const openMap = (address: string) => {
    const q = encodeURIComponent(`${address}, Oman`);
    const url = Platform.OS === 'ios' ? `maps:0,0?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
    Linking.openURL(url);
  };

  if (error) return <ErrorState onRetry={load} />;
  if (!rows) return <Loading />;

  return (
    <Screen>
      <AppText variant="title">{t('driverTitle')}</AppText>
      {message && <Notice tone="warning" text={message} />}
      {rows.length === 0 && <AppText>{t('noDeliveries')}</AppText>}
      {rows.map((d) => {
        const phone = phones[d.customer_id];
        return (
          <Card key={d.id}>
            <View style={styles.row}>
              <AppText variant="label">#{d.id.slice(0, 8).toUpperCase()}</AppText>
              <Badge text={statusLabels[lang][d.status]} />
            </View>
            <AppText variant="small" style={{ color: Colors.textSecondary }}>
              {t('pickupFrom')}: {pick(d.pharmacies?.name_ar, d.pharmacies?.name_en)}
            </AppText>
            <AppText>{d.delivery_address}</AppText>
            <AppText variant="label">
              {t('collectCash')}: {money(Number(d.total_omr))}
            </AppText>
            <View style={styles.actions}>
              <Button title={t('openMap')} variant="secondary" onPress={() => openMap(d.delivery_address)} style={styles.flex} />
              {phone ? (
                <Button title={t('callCustomer')} variant="secondary" onPress={() => Linking.openURL(`tel:+${phone.replace(/^\+/, '')}`)} style={styles.flex} />
              ) : null}
            </View>
            {d.status === 'out_for_delivery' ? (
              <Button title={t('markDelivered')} loading={busy === d.id} onPress={() => delivered(d.id)} />
            ) : (
              <Notice text={t('waitForPharmacy')} />
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
});
