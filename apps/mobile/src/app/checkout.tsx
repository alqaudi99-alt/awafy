import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Field, Notice, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { DELIVERY_ENABLED } from '@/lib/features';
import { useI18n } from '@/lib/i18n';
import { friendlyError, supabase } from '@/lib/supabase';
import type { Address } from '@/lib/types';

type PharmacyInfo = { address: string | null; phone: string | null; delivery_fee_omr: number };

export default function Checkout() {
  const { t, pick, money } = useI18n();
  const { session } = useAuth();
  const { cart, subtotal, hasRx, clear } = useCart();
  const [mode, setMode] = useState<'pickup' | 'delivery'>('pickup');
  const [pharmacy, setPharmacy] = useState<PharmacyInfo | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      router.replace('/login');
      return;
    }
    if (cart.pharmacyId) {
      supabase
        .from('pharmacies')
        .select('address, phone, delivery_fee_omr')
        .eq('id', cart.pharmacyId)
        .single()
        .then(({ data }) => setPharmacy(data));
    }
    if (DELIVERY_ENABLED) {
      supabase
        .from('addresses')
        .select('id, label, details')
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          setAddresses(data ?? []);
          if (data?.[0]) setSelected(data[0].id);
        });
    }
  }, [session, cart.pharmacyId]);

  const fee = mode === 'delivery' ? Number(pharmacy?.delivery_fee_omr ?? 0) : 0;
  const items = cart.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity }));

  const placeOrder = async () => {
    if (!session || !cart.pharmacyId) return;
    setBusy(true);
    setError(null);
    try {
      let orderId: string;
      // Prices, stock and totals are checked by the database; the app only sends product ids and quantities.
      if (mode === 'pickup') {
        const { data, error: err } = await supabase.rpc('place_pickup_order', { p_pharmacy_id: cart.pharmacyId, p_items: items });
        if (err) throw err;
        orderId = String(data);
      } else {
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
        const { data, error: err } = await supabase.rpc('place_order', {
          p_pharmacy_id: cart.pharmacyId,
          p_address_id: addressId,
          p_items: items,
        });
        if (err) throw err;
        orderId = String(data);
      }
      clear();
      router.replace({ pathname: '/order/[id]', params: { id: orderId } });
    } catch (e) {
      setError(e instanceof Error && e.message === t('addressDetails') ? e.message : friendlyError(e, t('orderFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {DELIVERY_ENABLED && (
        <View style={styles.row}>
          <Option active={mode === 'pickup'} onPress={() => setMode('pickup')} title={t('pickupAt')} />
          <Option active={mode === 'delivery'} onPress={() => setMode('delivery')} title={t('deliveryAddress')} />
        </View>
      )}

      {mode === 'pickup' ? (
        <Card>
          <AppText variant="heading">{t('pickupAt')}</AppText>
          <AppText variant="label">{pick(cart.pharmacyNameAr, cart.pharmacyNameEn)}</AppText>
          {pharmacy?.address ? <AppText variant="small">{pharmacy.address}</AppText> : null}
          {pharmacy?.phone ? <AppText variant="small">{pharmacy.phone}</AppText> : null}
          <AppText variant="small" style={{ color: Colors.textSecondary }}>
            {t('pickupHowTo')}
          </AppText>
        </Card>
      ) : (
        <>
          <AppText variant="heading">{t('deliveryAddress')}</AppText>
          {addresses.map((a) => (
            <Option key={a.id} active={selected === a.id} onPress={() => setSelected(a.id)} title={a.label ?? a.details} subtitle={a.label ? a.details : undefined} />
          ))}
          <Option active={selected === null} onPress={() => setSelected(null)} title={t('newAddress')} />
          {selected === null && (
            <Card>
              <Field label={t('addressLabel')} value={label} onChangeText={setLabel} />
              <Field label={t('addressDetails')} value={details} onChangeText={setDetails} multiline style={{ minHeight: 80 }} />
            </Card>
          )}
        </>
      )}

      <AppText variant="heading">{t('paymentMethod')}</AppText>
      <Option active onPress={() => undefined} title={mode === 'pickup' ? t('payAtPharmacy') : t('cashOnDelivery')} />

      <Card>
        <Row label={t('subtotal')} value={money(subtotal)} />
        {mode === 'delivery' && <Row label={t('deliveryFee')} value={money(fee)} />}
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
    <View style={styles.between}>
      <AppText variant={strong ? 'label' : 'body'}>{label}</AppText>
      <AppText variant={strong ? 'label' : 'body'}>{value}</AppText>
    </View>
  );
}

function Option({ active, onPress, title, subtitle }: { active: boolean; onPress: () => void; title: string; subtitle?: string }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={{ flex: 1 }}>
      <Card style={active && { borderColor: Colors.primary, borderWidth: 2 }}>
        <AppText variant="label">{(active ? '● ' : '○ ') + title}</AppText>
        {subtitle && <AppText variant="small">{subtitle}</AppText>}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
});
