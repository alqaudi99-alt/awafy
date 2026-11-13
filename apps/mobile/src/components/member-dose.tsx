import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Chip } from '@/components/chip';
import { AppText, Button, Card, Notice } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import type { DoseResult } from '@/lib/family';
import { type TKey, useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

const UNIT_AR: Record<string, string> = { ml: 'مل', tablet: 'قرص', capsule: 'كبسولة', sachet: 'كيس', suppository: 'تحميلة' };

/**
 * Dose for a family member, worked out by the database from their latest saved weight using
 * pharmacist-approved records only. Guests see what they unlock by registering.
 */
export function MemberDose({ productId }: { productId: number }) {
  const { t, lang, pick } = useI18n();
  const { isRegistered } = useAuth();
  const [members, setMembers] = useState<{ id: string; name: string }[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dose, setDose] = useState<{ memberId: string; result: DoseResult } | null>(null);
  // Only medicines with a dosage record get a dose card (not cosmetics or care products).
  const [hasDosage, setHasDosage] = useState<{ id: number; yes: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from('product_dosage')
      .select('dosage_id', { count: 'exact', head: true })
      .eq('product_id', productId)
      .then(({ count }) => alive && setHasDosage({ id: productId, yes: (count ?? 0) > 0 }));
    return () => {
      alive = false;
    };
  }, [productId]);

  useEffect(() => {
    if (!isRegistered) return;
    supabase
      .from('family_members')
      .select('id, name')
      .order('created_at')
      .then(({ data }) => {
        setMembers(data ?? []);
        if (data?.[0]) setSelected(data[0].id);
      });
  }, [isRegistered]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    supabase.rpc('member_dose', { p_member_id: selected, p_product_id: productId }).then(({ data }) => {
      if (alive && data) setDose({ memberId: selected, result: data as DoseResult });
    });
    return () => {
      alive = false;
    };
  }, [selected, productId]);

  if (!hasDosage || hasDosage.id !== productId || !hasDosage.yes) return null;
  if (!isRegistered) {
    return (
      <Card>
        <AppText variant="heading">{t('doseTitle')}</AppText>
        <AppText variant="small">{t('doseRegister')}</AppText>
        <Button title={t('regCta')} variant="secondary" onPress={() => router.push('/login')} />
      </Card>
    );
  }
  if (members === null) return null;
  if (members.length === 0) {
    return (
      <Card>
        <AppText variant="heading">{t('doseTitle')}</AppText>
        <AppText variant="small">{t('doseAddMember')}</AppText>
        <Button title={t('addMember')} variant="secondary" onPress={() => router.push('/family')} />
      </Card>
    );
  }

  const r = dose && dose.memberId === selected ? dose.result : null;
  const unit = r?.unit ? (lang === 'ar' ? UNIT_AR[r.unit] ?? r.unit : r.unit) : 'mg';
  const range = (lo?: number | null, hi?: number | null) => (lo == null ? '' : lo === hi || hi == null ? `${lo}` : `${lo} – ${hi}`);

  return (
    <Card>
      <AppText variant="heading">{t('doseTitle')}</AppText>
      <AppText variant="small">{t('doseFor')}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        {members.map((m) => (
          <Chip key={m.id} active={selected === m.id} label={m.name} onPress={() => setSelected(m.id)} />
        ))}
      </View>

      {r && (r.status === 'ok' || r.status === 'use_liquid') && r.weight_based && (
        <View style={{ gap: 4 }} accessibilityLiveRegion="polite">
          {r.amount_low != null ? (
            <AppText variant="title" style={{ color: Colors.primary }}>
              {`${range(r.amount_low, r.amount_high)} ${unit}`}
            </AppText>
          ) : null}
          <AppText variant={r.amount_low != null ? 'small' : 'title'}>{`${range(r.dose_mg_low, r.dose_mg_high)} mg ${t('perDose')}`}</AppText>
          {pick(r.frequency_ar, r.frequency_en) ? <AppText variant="small">{`${t('frequency')}: ${pick(r.frequency_ar, r.frequency_en)}`}</AppText> : null}
          {r.max_daily_mg != null && <AppText variant="small">{`${t('maxDaily')}: ${r.max_daily_mg} mg`}</AppText>}
          <AppText variant="small" style={{ color: Colors.textSecondary }}>
            {`${t('basedOnWeight')} ${r.weight_kg} kg · ${t('measured')} ${r.weighed_on}`}
          </AppText>
        </View>
      )}
      {r && r.status === 'ok' && !r.weight_based && r.dose_text ? <AppText>{r.dose_text}</AppText> : null}
      {r && r.status !== 'ok' && <Notice tone="warning" text={t(`dose_${r.status}` as TKey)} />}
      {r?.weight_stale && r.status !== 'no_weight' && <Notice tone="warning" text={t('weightStale')} />}
      {r && (r.weight_stale || r.status === 'no_weight') && (
        <Button title={t('updateWeight')} variant="secondary" onPress={() => router.push({ pathname: '/family/[id]', params: { id: selected! } })} />
      )}
      {r && pick(r.warnings_ar, r.warnings_en) ? <AppText variant="small">{`${t('warnings')}: ${pick(r.warnings_ar, r.warnings_en)}`}</AppText> : null}
      <AppText variant="small" style={{ color: Colors.textSecondary }}>
        {t('doseDisclaimer')}
      </AppText>
    </Card>
  );
}
