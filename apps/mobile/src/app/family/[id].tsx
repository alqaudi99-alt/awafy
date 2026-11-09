import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ErrorState, Field, Loading, Notice, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import {
  ageInMonths,
  ageLabel,
  type FamilyMember,
  isIsoDate,
  isWeightStale,
  type Measurement,
  type MemberMedication,
  parseNumber,
  todayIso,
} from '@/lib/family';
import { useI18n } from '@/lib/i18n';
import { friendlyError, supabase } from '@/lib/supabase';

export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const [member, setMember] = useState<FamilyMember | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [meds, setMeds] = useState<MemberMedication[]>([]);
  const [failed, setFailed] = useState(false);

  // measurement form
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [date, setDate] = useState(todayIso());
  // medicine form
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [showMed, setShowMed] = useState(false);
  // allergies / conditions
  const [allergies, setAllergies] = useState('');
  const [conditions, setConditions] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([
      supabase.from('family_members').select('id, name, relation, sex, birth_date, allergies, conditions').eq('id', id).single(),
      supabase.from('member_measurements').select('id, measured_on, weight_kg, length_cm').eq('member_id', id).order('measured_on', { ascending: false }),
      supabase.from('member_medications').select('id, name, dose_text, started_on, notes').eq('member_id', id).order('created_at', { ascending: false }),
    ]).then(([m, ms, md]) => {
      if (m.error || !m.data) return setFailed(true);
      setMember(m.data as FamilyMember);
      setAllergies(m.data.allergies ?? '');
      setConditions(m.data.conditions ?? '');
      setMeasurements((ms.data as Measurement[] | null) ?? []);
      setMeds((md.data as MemberMedication[] | null) ?? []);
    });
  }, [id]);
  useFocusEffect(load);

  if (failed) return <ErrorState onRetry={load} />;
  if (!member) return <Loading />;

  const months = ageInMonths(member.birth_date);
  const latest = measurements.find((x) => x.weight_kg != null);
  const stale = isWeightStale(latest?.measured_on, months);

  const addMeasurement = async () => {
    setError(null);
    const w = weight.trim() ? parseNumber(weight) : null;
    const l = length.trim() ? parseNumber(length) : null;
    if (w == null && l == null) return setError(t('weightKg'));
    if ((w != null && !(w >= 0.3 && w <= 350)) || (l != null && !(l >= 30 && l <= 250))) return setError(t('unusualValue'));
    if (!isIsoDate(date.trim())) return setError(t('invalidDate'));
    setBusy(true);
    const { error: err } = await supabase
      .from('member_measurements')
      .insert({ member_id: member.id, measured_on: date.trim(), weight_kg: w, length_cm: l });
    setBusy(false);
    if (err) return setError(friendlyError(err, t('loadError')));
    setWeight('');
    setLength('');
    setDate(todayIso());
    load();
  };

  const addMedicine = async () => {
    setError(null);
    if (!medName.trim()) return setError(t('medicineName'));
    setBusy(true);
    const { error: err } = await supabase
      .from('member_medications')
      .insert({ member_id: member.id, name: medName.trim(), dose_text: medDose.trim() || null, started_on: todayIso() });
    setBusy(false);
    if (err) return setError(friendlyError(err, t('loadError')));
    setMedName('');
    setMedDose('');
    setShowMed(false);
    load();
  };

  const saveHealthNotes = async () => {
    setError(null);
    setBusy(true);
    const { error: err } = await supabase
      .from('family_members')
      .update({ allergies: allergies.trim() || null, conditions: conditions.trim() || null })
      .eq('id', member.id);
    setBusy(false);
    if (err) setError(friendlyError(err, t('loadError')));
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: member.name }} />
      <AppText variant="title">{member.name}</AppText>
      {months != null && <AppText variant="small">{`${t('ageMonths')}: ${ageLabel(months, t)}`}</AppText>}

      <Card>
        <AppText variant="label">{t('latestWeight')}</AppText>
        <AppText variant="heading">{latest ? `${latest.weight_kg} kg` : t('noWeightYet')}</AppText>
        {latest && <AppText variant="small">{`${t('measured')} ${latest.measured_on}`}</AppText>}
        {stale && <Notice tone="warning" text={t('weightStale')} />}
      </Card>

      <Card>
        <AppText variant="heading">{stale ? t('updateWeight') : t('addMeasurement')}</AppText>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label={t('weightKg')} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('lengthCm')} value={length} onChangeText={setLength} keyboardType="decimal-pad" />
          </View>
        </View>
        <Field label={t('measuredOn')} value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
        <Button title={t('save')} loading={busy} onPress={addMeasurement} />
      </Card>

      {measurements.length > 0 && (
        <Card>
          <AppText variant="heading">{t('measurements')}</AppText>
          {measurements.map((m) => (
            <View key={m.id} style={styles.line}>
              <AppText variant="small" style={{ flex: 1 }}>
                {m.measured_on}
              </AppText>
              <AppText variant="small">{m.weight_kg != null ? `${m.weight_kg} kg` : '—'}</AppText>
              <AppText variant="small" style={styles.cell}>
                {m.length_cm != null ? `${m.length_cm} cm` : '—'}
              </AppText>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <AppText variant="heading">{t('medicines')}</AppText>
        {meds.map((m) => (
          <View key={m.id} style={styles.line}>
            <AppText style={{ flex: 1 }}>{m.name}</AppText>
            <AppText variant="small">{m.dose_text ?? ''}</AppText>
          </View>
        ))}
        {showMed ? (
          <>
            <Field label={t('medicineName')} value={medName} onChangeText={setMedName} />
            <Field label={t('doseText')} value={medDose} onChangeText={setMedDose} />
            <Button title={t('save')} loading={busy} onPress={addMedicine} />
          </>
        ) : (
          <Button title={t('addMedicine')} variant="secondary" onPress={() => setShowMed(true)} />
        )}
      </Card>

      <Card>
        <Field label={t('allergies')} value={allergies} onChangeText={setAllergies} multiline />
        <Field label={t('conditions')} value={conditions} onChangeText={setConditions} multiline />
        <Button title={t('save')} variant="secondary" loading={busy} onPress={saveHealthNotes} />
      </Card>

      {error && <Notice tone="warning" text={error} />}
      <AppText variant="small" style={{ color: Colors.textSecondary }}>
        {t('doseDisclaimer')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  cell: { minWidth: 64, textAlign: 'right' },
});
