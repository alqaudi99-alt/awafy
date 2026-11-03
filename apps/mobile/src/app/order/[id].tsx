import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, ErrorState, Loading, Notice, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { statusLabels, useI18n } from '@/lib/i18n';
import { friendlyError, supabase } from '@/lib/supabase';
import type { Order, OrderEvent } from '@/lib/types';

type Item = { id: number; product_name: string; quantity: number; unit_price_omr: number };
type Rx = { id: string; status: 'pending' | 'approved' | 'rejected'; review_note: string | null };
type Detail = Order & { order_items: Item[]; order_events: OrderEvent[]; prescriptions: Rx[] };

const SELECT =
  'id, status, total_omr, subtotal_omr, delivery_fee_omr, requires_rx, delivery_address, cancel_reason, created_at, pharmacies(id, name_ar, name_en, delivery_fee_omr), order_items(id, product_name, quantity, unit_price_omr), order_events(id, status, note, created_at), prescriptions(id, status, review_note)';

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, pick, money } = useI18n();
  const { session } = useAuth();
  const [order, setOrder] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    supabase
      .from('orders')
      .select(SELECT)
      .eq('id', id)
      .order('created_at', { referencedTable: 'order_events', ascending: true })
      .returns<Detail>()
      .single()
      .then(({ data, error: err }) => (err ? setError(true) : setOrder(data)));
  }, [id]);

  useEffect(() => {
    load();
    // Live tracking: reload whenever this order or its history changes.
    const channel = supabase
      .channel(`order-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events', filter: `order_id=eq.${id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  const uploadPrescription = async () => {
    if (!session || !order) return;
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy(true);
    setMessage(null);
    try {
      const asset = picked.assets[0];
      const body = await (await fetch(asset.uri)).arrayBuffer();
      const contentType = asset.mimeType ?? 'image/jpeg';
      const ext = contentType.split('/')[1] ?? 'jpg';
      // Files live in a folder named after the user; storage rules reject any other folder.
      const path = `${session.user.id}/${order.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('prescriptions').upload(path, body, { contentType });
      if (upErr) throw upErr;
      const { error: rpcErr } = await supabase.rpc('attach_prescription', { p_order_id: order.id, p_storage_path: path });
      if (rpcErr) throw rpcErr;
      setMessage(t('rxUploaded'));
      load();
    } catch (e) {
      setMessage(friendlyError(e, t('loadError')));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    const { error: err } = await supabase.rpc('set_order_status', {
      p_order_id: id,
      p_status: 'cancelled',
      p_note: t('cancelReason'),
    });
    setBusy(false);
    if (err) setMessage(friendlyError(err, t('loadError')));
    else load();
  };

  if (error) return <ErrorState onRetry={load} />;
  if (!order) return <Loading />;

  const latestRx = order.prescriptions.at(-1);
  const canUpload = order.requires_rx && ['awaiting_prescription', 'placed'].includes(order.status) && latestRx?.status !== 'pending' && latestRx?.status !== 'approved';
  const canCancel = ['awaiting_prescription', 'placed'].includes(order.status);

  return (
    <Screen>
      <View style={styles.row}>
        <AppText variant="heading">
          {t('orderNumber')} #{order.id.slice(0, 8).toUpperCase()}
        </AppText>
        <Badge text={statusLabels[lang][order.status]} tone={order.status === 'cancelled' ? 'danger' : 'info'} />
      </View>
      <AppText variant="small" style={{ color: Colors.textSecondary }}>
        {pick(order.pharmacies?.name_ar, order.pharmacies?.name_en)} · {order.delivery_address}
      </AppText>

      {order.status === 'awaiting_prescription' && <Notice tone="warning" text={t('rxNeeded')} />}
      {latestRx?.status === 'rejected' && latestRx.review_note && <Notice tone="warning" text={latestRx.review_note} />}
      {latestRx?.status === 'pending' && <Notice text={t('rxUploaded')} />}
      {canUpload && <Button title={t('uploadRx')} loading={busy} onPress={uploadPrescription} />}
      {message && <Notice text={message} />}

      <Card>
        {order.order_items.map((item) => (
          <View key={item.id} style={styles.row}>
            <AppText style={{ flex: 1 }}>
              {item.quantity} × {item.product_name}
            </AppText>
            <AppText>{money(item.quantity * Number(item.unit_price_omr))}</AppText>
          </View>
        ))}
        <View style={styles.row}>
          <AppText>{t('deliveryFee')}</AppText>
          <AppText>{money(Number(order.delivery_fee_omr))}</AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="label">{t('total')}</AppText>
          <AppText variant="label">{money(Number(order.total_omr))}</AppText>
        </View>
        <AppText variant="small">{t('cashOnDelivery')}</AppText>
      </Card>

      <AppText variant="heading">{t('timeline')}</AppText>
      <Card>
        {order.order_events.map((event) => (
          <View key={event.id} style={styles.event}>
            <View style={styles.dot} />
            <View style={{ flex: 1 }}>
              <AppText variant="label">{statusLabels[lang][event.status]}</AppText>
              <AppText variant="small" style={{ color: Colors.textSecondary }}>
                {new Date(event.created_at).toLocaleString(lang === 'ar' ? 'ar-OM' : 'en-GB')}
                {event.note ? ` · ${event.note}` : ''}
              </AppText>
            </View>
          </View>
        ))}
      </Card>

      {canCancel && <Button title={t('cancelOrder')} variant="secondary" loading={busy} onPress={cancel} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  event: { flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.xs },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary, marginTop: 7 },
});
