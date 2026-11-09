import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RegisterBenefits } from '@/components/register-benefits';
import { Chip } from '@/components/chip';
import { AppText, Badge, Button, Card, Field, Notice, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { ageInMonths, ageLabel, type FamilyMember, isIsoDate, isWeightStale, RELATIONS, type Relation } from '@/lib/family';
import { type TKey, useI18n } from '@/lib/i18n';
import { friendlyError, supabase } from '@/lib/supabase';

type Row = FamilyMember & { member_measurements: { measured_on: string; weight_kg: number | null }[] };

export default function FamilyScreen() {
  const { t } = useI18n();
  const { isRegistered } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState<Relation>('child');
  const [sex, setSex] = useState<'male' | 'female' | null>(null);
  const [birth, setBirth] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isRegistered) return;
    supabase
      .from('family_members')
      .select('id, name, relation, sex, birth_date, allergies, conditions, member_measurements(measured_on, weight_kg)')
      .order('created_at')
      .order('measured_on', { referencedTable: 'member_measurements', ascending: false })
      .then(({ data }) => setRows((data as Row[] | null) ?? []));
  }, [isRegistered]);
  useFocusEffect(load);

  if (!isRegistered) {
    return (
      <Screen>
        <AppText variant="title">{t('familyTitle')}</AppText>
        <RegisterBenefits />
      </Screen>
    );
  }

  const save = async () => {
    setError(null);
    if (name.trim().length < 1) return setError(t('memberName'));
    if (birth.trim() && !isIsoDate(birth.trim())) return setError(t('invalidDate'));
    setBusy(true);
    const { error: err } = await supabase
      .from('family_members')
      .insert({ name: name.trim(), relation, sex, birth_date: birth.trim() || null });
    setBusy(false);
    if (err) return setError(friendlyError(err, t('loadError')));
    setName('');
    setBirth('');
    setSex(null);
    setAdding(false);
    load();
  };

  return (
    <Screen>
      <AppText variant="title">{t('familyTitle')}</AppText>
      {rows.length === 0 && !adding && <Notice text={t('familyEmpty')} />}
      {rows.map((m) => {
        const months = ageInMonths(m.birth_date);
        const latest = m.member_measurements.find((x) => x.weight_kg != null);
        const stale = isWeightStale(latest?.measured_on, months);
        return (
          <Pressable key={m.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/family/[id]', params: { id: m.id } })}>
            <Card>
              <View style={styles.row}>
                <AppText variant="label" style={{ flex: 1 }}>
                  {m.name}
                </AppText>
                <AppText variant="small">{ageLabel(months, t)}</AppText>
              </View>
              <AppText variant="small">
                {latest ? `${t('latestWeight')}: ${latest.weight_kg} kg · ${latest.measured_on}` : t('noWeightYet')}
              </AppText>
              {stale && <Badge text={t('updateWeight')} tone="warning" />}
            </Card>
          </Pressable>
        );
      })}

      {adding ? (
        <Card>
          <Field label={t('memberName')} value={name} onChangeText={setName} />
          <AppText variant="small">{t('relation')}</AppText>
          <View style={styles.chips}>
            {RELATIONS.map((r) => (
              <Chip key={r} active={relation === r} label={t(`rel_${r}` as TKey)} onPress={() => setRelation(r)} />
            ))}
          </View>
          <AppText variant="small">{t('sex')}</AppText>
          <View style={styles.chips}>
            <Chip active={sex === 'male'} label={t('male')} onPress={() => setSex('male')} />
            <Chip active={sex === 'female'} label={t('female')} onPress={() => setSex('female')} />
          </View>
          <Field label={t('birthDate')} value={birth} onChangeText={setBirth} placeholder="2023-05-14" keyboardType="numbers-and-punctuation" />
          {error && <Notice tone="warning" text={error} />}
          <Button title={t('save')} loading={busy} onPress={save} />
          <Button title={t('cancel')} variant="secondary" onPress={() => setAdding(false)} />
        </Card>
      ) : (
        <Button title={t('addMember')} onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
