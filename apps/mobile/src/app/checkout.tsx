import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Field, Notice, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { ensureSession, toOmanE164, useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { DELIVERY_ENABLED } from '@/lib/features';
import { useI18n } from '@/lib/i18n';
import { friendlyError, supabase } from '@/lib/supabase';
import type { Address, Fulfilment } from '@/lib/types';

type PharmacyInfo = { address: string | null; phone: string | null; delivery_fee_omr: number; urgent_delivery_fee_omr: number | null };

export default function Checkout() {
  const { t, pick, money } = useI18n();
  const { session, isRegistered } = useAuth();
  const { cart, subtotal, hasRx, hasRestricted, clear } = useCart();
  const [mode, setMode] = useState<Fulfilment>('pickup');
  const [pharmacy, setPharmacy] = useState<PharmacyInfo | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guests (no account) give a name and phone so the pharmacy can reach them.
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  useEffect(() => {
    if (cart.pharmacyId) {
      supabase
        .from('pharmacies')
        .select('address, phone, delivery_fee_omr, urgent_delivery_fee_omr')
        .eq('id', cart.pharmacyId)
        .single()
        .then(({ data }) => setPharmacy(data));
    }
    if (session && !isRegistered) {
      supabase
        .from('profiles')
        .select('full_name, contact_phone')
        .eq('id', session.user.id)
        .single()
        .then(({ data }) => {
          if (data?.full_name) setGuestName(data.full_name);
          if (data?.contact_phone) setGuestPhone(String(data.contact_phone).replace(/^\+968/, ''));
        });
    }
    if (DELIVERY_ENABLED && session) {
      supabase
        .from('addresses')
        .select('id, label, details')
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          setAddresses(data ?? []);
          if (data?.[0]) setSelected(data[0].id);
        });
    }
  }, [session, isRegistered, cart.pharmacyId]);

  const normalFee = Number(pharmacy?.delivery_fee_omr ?? 0);
  const urgentFee = pharmacy?.urgent_delivery_fee_omr == null ? null : Number(pharmacy.urgent_delivery_fee_omr);
  // Medicines needing the original stamped prescription can only be collected (the database enforces it too).
  const effectiveMode: Fulfilment = hasRestricted ? 'pickup' : mode;
  const isDelivery = effectiveMode !== 'pickup';
  const fee = effectiveMode === 'delivery' ? normalFee : effectiveMode === 'urgent_delivery' ? (urgentFee ?? 0) : 0;
  const items = cart.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity }));

  const placeOrder = async () => {
    if (!cart.pharmacyId) return;
    setError(null);
    let guestPhoneE164: string | null = null;
    if (!isRegistered) {
      if (guestName.trim().length < 2) return setError(t('guestNameNeeded'));
      guestPhoneE164 = toOmanE164(guestPhone);
      if (!guestPhoneE164) return setError(t('invalidPhone'));
    }
    setBusy(true);
    try {
      const current = await ensureSession();
      if (guestPhoneE164) {
        const { error: err } = await supabase
          .from('profiles')
          .update({ full_name: guestName.trim(), contact_phone: guestPhoneE164 })
          .eq('id', current.user.id);
        if (err) throw err;
      }
      let orderId: string;
      // Prices, stock and totals are checked by the database; the app only sends product ids and quantities.
      if (effectiveMode === 'pickup') {
        const { data, error: err } = await supabase.rpc('place_pickup_order', { p_pharmacy_id: cart.pharmacyId, p_items: items });
        if (err) throw err;
        orderId = String(data);
      } else {
        let addressId = selected;
        if (!addressId) {
          if (details.trim().length < 5) throw new Error(t('addressDetails'));
          const { data, error: err } = await supabase
            .from('addresses')
            .insert({ user_id: current.user.id, label: label.trim() || null, details: details.trim() })
            .select('id')
            .single();
          if (err) throw err;
          addressId = data.id;
        }
        const { data, error: err } = await supabase.rpc('place_order', {
          p_pharmacy_id: cart.pharmacyId,
          p_address_id: addressId,
          p_items: items,
          p_urgent: mode === 'urgent_delivery',
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
      {hasRestricted && <Notice tone="warning" text={t('restrictedCheckout')} />}
      {DELIVERY_ENABLED && !hasRestricted && (
        <View accessibilityRole="radiogroup" style={{ gap: Spacing.sm }}>
          <AppText variant="heading">{t('howToReceive')}</AppText>
          <Option active={mode === 'pickup'} onPress={() => setMode('pickup')} title={t('optPickup')} subtitle={t('freeLabel')} />
          <Option active={mode === 'delivery'} onPress={() => setMode('delivery')} title={t('optDelivery')} subtitle={money(normalFee)} />
          {urgentFee != null ? (
            <Option
              active={mode === 'urgent_delivery'}
              onPress={() => setMode('urgent_delivery')}
              title={t('optUrgent')}
              subtitle={`${money(urgentFee)} · ${t('urgentNote')}`}
            />
          ) : pharmacy ? (
            <AppText variant="small" style={{ color: Colors.textSecondary }}>
              {t('urgentNotOffered')}
            </AppText>
          ) : null}
        </View>
      )}

      {!isRegistered && (
        <Card>
          <AppText variant="heading">{t('guestTitle')}</AppText>
          <AppText variant="small" style={{ color: Colors.textSecondary }}>
            {t('guestSubtitle')}
          </AppText>
          <Field label={t('guestName')} value={guestName} onChangeText={setGuestName} autoComplete="name" textContentType="name" />
          <Field
            label={t('phone')}
            value={guestPhone}
            onChangeText={setGuestPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="9XXXXXXX"
          />
          <Button title={t('guestRegisterCta')} variant="secondary" onPress={() => router.push('/login')} />
        </Card>
      )}

      {effectiveMode === 'pickup' ? (
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
      <Option active onPress={() => undefined} title={effectiveMode === 'pickup' ? t('payAtPharmacy') : t('cashOnDelivery')} />

      <Card>
        <Row label={t('subtotal')} value={money(subtotal)} />
        {isDelivery && <Row label={effectiveMode === 'urgent_delivery' ? `${t('deliveryFee')} (${t('urgentBadge')})` : t('deliveryFee')} value={money(fee)} />}
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
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress}>
      <Card style={active && { borderColor: Colors.primary, borderWidth: 2 }}>
        <AppText variant="label">{(active ? '● ' : '○ ') + title}</AppText>
        {subtitle && <AppText variant="small">{subtitle}</AppText>}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
});
