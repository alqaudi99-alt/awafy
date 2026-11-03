import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Field, Notice, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useI18n } from '@/lib/i18n';
import { friendlyError, supabase } from '@/lib/supabase';
import type { Address } from '@/lib/types';

export default function Checkout() {
  const { t, pick, money } = useI18n();
  const { session } = useAuth();
  const { cart, subtotal, hasRx, clear } = useCart();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [details, setDetails] = useState('');
  const [fee, setFee] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      router.replace('/login');
      return;
    }
    supabase
      .from('addresses')
      .select('id, label, details')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setAddresses(data ?? []);
        if (data?.[0]) setSelected(data[0].id);
      });
    if (cart.pharmacyId) {
      supabase
        .from('pharmacies')
        .select('delivery_fee_omr')
        .eq('id', cart.pharmacyId)
        .single()
        .then(({ data }) => setFee(Number(data?.delivery_fee_omr ?? 0)));
    }
  }, [session, cart.pharmacyId]);

  const placeOrder = async () => {
    if (!session || !cart.pharmacyId) return;
    setBusy(true);
    setError(null);
    try {
      let addressId = selected;
      if (!addressId) {
        if (details.trim().length < 5) throw new Error(t('addressDetails'));
        const { data, error: err } = await supabase
          .from('addresses')
          .insert({ user_id: session.user.id, label: label.trim() || null, details: details.trim() })
          .select('id')
          .single();
        if (err) throw err;
        addressId = data.id;
      }
      // Prices and totals are recalculated by the database; the app only sends product ids and quantities.
      const { data: orderId, error: err } = await supabase.rpc('place_order', {
        p_pharmacy_id: cart.pharmacyId,
        p_address_id: addressId,
        p_items: cart.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
      });
      if (err) throw err;
      clear();
      router.replace({ pathname: '/order/[id]', params: { id: String(orderId) } });
    } catch (e) {
      setError(e instanceof Error && e.message === t('addressDetails') ? e.message : friendlyError(e, t('orderFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppText variant="heading">{t('deliveryAddress')}</AppText>
      {addresses.length > 0 && (
        <>
          <AppText variant="small">{t('savedAddresses')}</AppText>
          {addresses.map((a) => (
            <Option key={a.id} active={selected === a.id} onPress={() => setSelected(a.id)} title={a.label ?? a.details} subtitle={a.label ? a.details : undefined} />
          ))}
          <Option active={selected === null} onPress={() => setSelected(null)} title={t('newAddress')} />
        </>
      )}
      {selected === null && (
        <Card>
          <Field label={t('addressLabel')} value={label} onChangeText={setLabel} />
          <Field label={t('addressDetails')} value={details} onChangeText={setDetails} multiline style={{ minHeight: 80 }} />
        </Card>
      )}

      <AppText variant="heading">{t('paymentMethod')}</AppText>
      <Option active onPress={() => undefined} title={t('cashOnDelivery')} />

      <Card>
        <AppText variant="small" style={{ color: Colors.textSecondary }}>
          {t('pharmacy')}: {pick(cart.pharmacyNameAr, cart.pharmacyNameEn)}
        </AppText>
        <Row label={t('subtotal')} value={money(subtotal)} />
        <Row label={t('deliveryFee')} value={money(fee)} />
        <Row label={t('total')} value={money(subtotal + fee)} strong />
      </Card>

      {hasRx && <Notice tone="warning" text={t('rxNoteCart')} />}
      {error && <Notice tone="warning" text={error} />}
      <Button title={t('placeOrder')} loading={busy} disabled={cart.lines.length === 0} onPress={placeOrder} />
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText variant={strong ? 'label' : 'body'}>{label}</AppText>
      <AppText variant={strong ? 'label' : 'body'}>{value}</AppText>
    </View>
  );
}

function Option({ active, onPress, title, subtitle }: { active: boolean; onPress: () => void; title: string; subtitle?: string }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress}>
      <Card style={active && { borderColor: Colors.primary, borderWidth: 2 }}>
        <AppText variant="label">{(active ? '● ' : '○ ') + title}</AppText>
        {subtitle && <AppText variant="small">{subtitle}</AppText>}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
});
