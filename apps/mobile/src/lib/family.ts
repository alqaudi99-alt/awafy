export type Relation = 'self' | 'spouse' | 'child' | 'parent' | 'other';

export type FamilyMember = {
  id: string;
  name: string;
  relation: Relation;
  sex: 'male' | 'female' | null;
  birth_date: string | null;
  allergies: string | null;
  conditions: string | null;
};

export type Measurement = { id: number; measured_on: string; weight_kg: number | null; length_cm: number | null };

export type MemberMedication = {
  id: number;
  name: string;
  dose_text: string | null;
  started_on: string | null;
  notes: string | null;
};

export type DoseResult = {
  status: 'ok' | 'no_rule' | 'not_reviewed' | 'no_weight' | 'no_age' | 'no_matching_rule' | 'use_liquid';
  weight_kg?: number | null;
  weighed_on?: string | null;
  weight_stale?: boolean;
  age_months?: number | null;
  weight_based?: boolean;
  dose_mg_low?: number | null;
  dose_mg_high?: number | null;
  max_daily_mg?: number | null;
  amount_low?: number | null;
  amount_high?: number | null;
  unit?: string | null;
  dose_text?: string | null;
  frequency_ar?: string | null;
  frequency_en?: string | null;
  warnings_ar?: string | null;
  warnings_en?: string | null;
};

export const RELATIONS: Relation[] = ['child', 'self', 'spouse', 'parent', 'other'];

/** Age in whole months from an ISO date (YYYY-MM-DD). */
export function ageInMonths(birthDate: string | null, today = new Date()): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  let m = (today.getFullYear() - b.getFullYear()) * 12 + (today.getMonth() - b.getMonth());
  if (today.getDate() < b.getDate()) m -= 1;
  return Math.max(0, m);
}

/** Same rule as the database: under 1 year 30 days, under 5 years 90 days, otherwise 180 days. */
export function staleAfterDays(ageMonths: number | null): number {
  if (ageMonths == null) return 90;
  if (ageMonths < 12) return 30;
  if (ageMonths < 60) return 90;
  return 180;
}

export function isWeightStale(measuredOn: string | null | undefined, ageMonths: number | null, today = new Date()): boolean {
  if (!measuredOn) return true;
  const d = new Date(`${measuredOn}T00:00:00`);
  const days = (today.getTime() - d.getTime()) / 86_400_000;
  return days > staleAfterDays(ageMonths);
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d <= new Date() && d.getFullYear() >= 1900;
}

/** Parses Arabic-Indic digits and comma decimals. */
export function parseNumber(s: string): number {
  const n = s
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٫,،]/g, '.');
  return n === '' ? NaN : Number(n);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ageLabel(months: number | null, t: (k: 'months' | 'years') => string): string {
  if (months == null) return '';
  return months < 24 ? `${months} ${t('months')}` : `${Math.floor(months / 12)} ${t('years')}`;
}
