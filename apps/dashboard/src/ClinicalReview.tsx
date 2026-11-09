import { useCallback, useEffect, useMemo, useState } from 'react';

import { errorText, supabase } from './supabase';

type Status = 'pending_review' | 'approved' | 'retired';
type Dose = {
  id: number;
  drug_name_ar: string;
  drug_name_en: string | null;
  age_group_ar: string | null;
  dose_text: string | null;
  weight_based: boolean;
  per_kg_low: number | null;
  per_kg_high: number | null;
  max_single_mg: number | null;
  max_daily_mg: number | null;
  max_daily_mg_per_kg: number | null;
  min_age_months: number | null;
  max_age_months: number | null;
  frequency_ar: string | null;
  warnings_ar: string | null;
  requires_rx: boolean;
  review_status: Status;
  review_note: string | null;
  review_date: string | null;
};
type Symptom = {
  id: number;
  body_region: string;
  name_ar: string;
  age_group_ar: string | null;
  suggestion_ar: string | null;
  red_flags_ar: string | null;
  review_status: Status;
  review_note: string | null;
  review_date: string | null;
};

const STATUS: Record<Status, string> = { pending_review: 'بانتظار المراجعة', approved: 'معتمد', retired: 'موقوف' };

/**
 * Clinical content review for licensed pharmacists (role: clinical_reviewer).
 * The database only lets a clinical reviewer approve; any edit by someone else sends the record back to review,
 * and every change is kept in the audit log.
 */
export function ClinicalReview({ canApprove }: { canApprove: boolean }) {
  const [kind, setKind] = useState<'dosage' | 'symptoms'>('dosage');
  const [filter, setFilter] = useState<'pending_review' | 'all'>('pending_review');
  const [doses, setDoses] = useState<Dose[]>([]);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [products, setProducts] = useState<{ id: number; name_ar: string }[]>([]);
  const [links, setLinks] = useState<{ product_id: number; dosage_id: number }[]>([]);

  const load = useCallback(async () => {
    const pr = await supabase.from('products').select('id, name_ar').order('name_ar');
    const ln = await supabase.from('product_dosage').select('product_id, dosage_id');
    setProducts(pr.data ?? []);
    setLinks(ln.data ?? []);
    const d = await supabase.from('dosage_reference').select('*').order('id').returns<Dose[]>();
    const s = await supabase.from('symptom_reference').select('*').order('id').returns<Symptom[]>();
    if (d.error || s.error) return setMsg(errorText(d.error ?? s.error));
    // Records with a known problem (CHECK / CORRECTED) first, so reviewers see them before the rest.
    const flagged = (x: Dose) => (/CHECK|CORRECTED/.test(x.review_note ?? '') ? 0 : 1);
    setDoses((d.data ?? []).sort((a, b) => flagged(a) - flagged(b) || a.id - b.id));
    setSymptoms(s.data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (table: 'dosage_reference' | 'symptom_reference', id: number, patch: Record<string, unknown>) => {
    setMsg(null);
    const { error } = await supabase.from(table).update(patch).eq('id', id);
    setMsg(error ? errorText(error) : 'تم الحفظ');
    load();
  };

  // Which products this dosage record applies to (used to work out doses from a family member's weight).
  const saveLinks = async (dosageId: number, productIds: number[]) => {
    setMsg(null);
    const current = links.filter((l) => l.dosage_id === dosageId).map((l) => l.product_id);
    const toAdd = productIds.filter((p) => !current.includes(p));
    const toRemove = current.filter((p) => !productIds.includes(p));
    if (toAdd.length) {
      const { error } = await supabase.from('product_dosage').insert(toAdd.map((product_id) => ({ product_id, dosage_id: dosageId })));
      if (error) return setMsg(errorText(error));
    }
    if (toRemove.length) {
      const { error } = await supabase.from('product_dosage').delete().eq('dosage_id', dosageId).in('product_id', toRemove);
      if (error) return setMsg(errorText(error));
    }
    setMsg('تم ربط المنتجات');
    load();
  };

  const pending = useMemo(
    () => doses.filter((d) => d.review_status === 'pending_review').length + symptoms.filter((s) => s.review_status === 'pending_review').length,
    [doses, symptoms],
  );

  return (
    <section>
      <div className="row">
        <h2>المراجعة السريرية</h2>
        <span className="pill">{pending} بانتظار المراجعة</span>
      </div>
      <p className="notice">
        لا يظهر أي سجل للعملاء قبل اعتماده من صيدلي مُراجِع. أي تعديل من غير المراجِع يعيد السجل إلى "بانتظار المراجعة"، وكل تغيير يُحفظ في سجل التدقيق.
        {!canApprove && ' (حسابك يستطيع التعديل فقط؛ الاعتماد للصيدلي المراجِع.)'}
      </p>
      <div className="row">
        <nav className="seg">
          <button className={kind === 'dosage' ? 'on' : 'ghost'} onClick={() => setKind('dosage')}>الجرعات ({doses.length})</button>
          <button className={kind === 'symptoms' ? 'on' : 'ghost'} onClick={() => setKind('symptoms')}>الأعراض ({symptoms.length})</button>
        </nav>
        <select value={filter} onChange={(e) => setFilter(e.target.value as 'pending_review' | 'all')}>
          <option value="pending_review">بانتظار المراجعة</option>
          <option value="all">الكل</option>
        </select>
      </div>
      {msg && <p className="notice">{msg}</p>}

      {kind === 'dosage'
        ? doses
            .filter((d) => filter === 'all' || d.review_status === filter)
            .map((d) => (
                <DoseCard
                  key={d.id}
                  d={d}
                  canApprove={canApprove}
                  onSave={(p) => save('dosage_reference', d.id, p)}
                  products={products}
                  linked={links.filter((l) => l.dosage_id === d.id).map((l) => l.product_id)}
                  onLink={(ids) => saveLinks(d.id, ids)}
                />
              ))
        : symptoms
            .filter((s) => filter === 'all' || s.review_status === filter)
            .map((s) => <SymptomCard key={s.id} s={s} canApprove={canApprove} onSave={(p) => save('symptom_reference', s.id, p)} />)}
    </section>
  );
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));

function DoseCard({
  d,
  canApprove,
  onSave,
  products,
  linked,
  onLink,
}: {
  d: Dose;
  canApprove: boolean;
  onSave: (p: Record<string, unknown>) => void;
  products: { id: number; name_ar: string }[];
  linked: number[];
  onLink: (ids: number[]) => void;
}) {
  const [linkIds, setLinkIds] = useState<number[]>(linked);
  const [f, setF] = useState({
    dose_text: d.dose_text ?? '',
    weight_based: d.weight_based,
    per_kg_low: d.per_kg_low?.toString() ?? '',
    per_kg_high: d.per_kg_high?.toString() ?? '',
    max_single_mg: d.max_single_mg?.toString() ?? '',
    max_daily_mg: d.max_daily_mg?.toString() ?? '',
    max_daily_mg_per_kg: d.max_daily_mg_per_kg?.toString() ?? '',
    min_age_months: d.min_age_months?.toString() ?? '',
    max_age_months: d.max_age_months?.toString() ?? '',
    frequency_ar: d.frequency_ar ?? '',
    warnings_ar: d.warnings_ar ?? '',
    review_note: d.review_note ?? '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });
  const patch = () => ({
    dose_text: f.dose_text,
    weight_based: f.weight_based,
    per_kg_low: f.weight_based ? num(f.per_kg_low) : null,
    per_kg_high: f.weight_based ? num(f.per_kg_high) : null,
    max_single_mg: num(f.max_single_mg),
    max_daily_mg: num(f.max_daily_mg),
    max_daily_mg_per_kg: num(f.max_daily_mg_per_kg),
    min_age_months: num(f.min_age_months),
    max_age_months: num(f.max_age_months),
    frequency_ar: f.frequency_ar,
    warnings_ar: f.warnings_ar,
    review_note: f.review_note,
  });
  const flagged = /CHECK|CORRECTED/.test(d.review_note ?? '');

  return (
    <article className={`card ${flagged ? 'status-awaiting_prescription' : ''}`}>
      <div className="row">
        <strong>{d.drug_name_ar}</strong>
        <span className="pill">{STATUS[d.review_status]}</span>
      </div>
      <p className="muted">{d.age_group_ar} {d.requires_rx ? '· يتطلب وصفة' : ''} {d.review_date ? `· اعتُمد ${new Date(d.review_date).toLocaleDateString('ar-OM')}` : ''}</p>
      <div className="grid">
        <label>الجرعة (نص)<input value={f.dose_text} onChange={set('dose_text')} /></label>
        <label className="inline"><input type="checkbox" checked={f.weight_based} onChange={set('weight_based')} /> تُحسب حسب الوزن</label>
        {f.weight_based && (
          <>
            <label>ملغم/كغم (أدنى)<input dir="ltr" inputMode="decimal" value={f.per_kg_low} onChange={set('per_kg_low')} /></label>
            <label>ملغم/كغم (أعلى)<input dir="ltr" inputMode="decimal" value={f.per_kg_high} onChange={set('per_kg_high')} /></label>
          </>
        )}
        <label>أقصى جرعة واحدة (ملغم)<input dir="ltr" inputMode="decimal" value={f.max_single_mg} onChange={set('max_single_mg')} /></label>
        <label>أقصى يومي (ملغم)<input dir="ltr" inputMode="decimal" value={f.max_daily_mg} onChange={set('max_daily_mg')} /></label>
        <label>أقصى يومي (ملغم/كغم)<input dir="ltr" inputMode="decimal" value={f.max_daily_mg_per_kg} onChange={set('max_daily_mg_per_kg')} /></label>
        <label>من عمر (بالأشهر)<input dir="ltr" inputMode="numeric" value={f.min_age_months} onChange={set('min_age_months')} /></label>
        <label>إلى عمر أقل من (بالأشهر)<input dir="ltr" inputMode="numeric" value={f.max_age_months} onChange={set('max_age_months')} /></label>
        <label>التكرار<input value={f.frequency_ar} onChange={set('frequency_ar')} /></label>
      </div>
      <label>
        المنتجات التي تنطبق عليها هذه الجرعة (لحساب الجرعة من وزن فرد العائلة)
        <select
          multiple
          size={Math.min(6, Math.max(3, products.length))}
          value={linkIds.map(String)}
          onChange={(e) => setLinkIds(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name_ar}</option>
          ))}
        </select>
      </label>
      <button className="ghost" onClick={() => onLink(linkIds)}>حفظ ربط المنتجات</button>
      <label>التحذيرات<textarea rows={2} value={f.warnings_ar} onChange={set('warnings_ar')} /></label>
      <label>ملاحظة المراجعة<input value={f.review_note} onChange={set('review_note')} /></label>
      <div className="row actions">
        <button className="ghost" onClick={() => onSave(patch())}>حفظ التعديل</button>
        {canApprove && d.review_status !== 'approved' && (
          <button onClick={() => window.confirm(`اعتماد "${d.drug_name_ar}" للعرض للعملاء؟`) && onSave({ ...patch(), review_status: 'approved' })}>اعتماد</button>
        )}
        {canApprove && d.review_status === 'approved' && (
          <button className="danger ghost" onClick={() => onSave({ review_status: 'retired' })}>إيقاف العرض</button>
        )}
      </div>
    </article>
  );
}

function SymptomCard({ s, canApprove, onSave }: { s: Symptom; canApprove: boolean; onSave: (p: Record<string, unknown>) => void }) {
  const [suggestion, setSuggestion] = useState(s.suggestion_ar ?? '');
  const [flags, setFlags] = useState(s.red_flags_ar ?? '');
  const [note, setNote] = useState(s.review_note ?? '');
  const patch = () => ({ suggestion_ar: suggestion, red_flags_ar: flags, review_note: note });
  return (
    <article className="card">
      <div className="row">
        <strong>{s.name_ar}</strong>
        <span className="pill">{STATUS[s.review_status]}</span>
      </div>
      <p className="muted">{s.age_group_ar} · {s.body_region}</p>
      <label>الاقتراح<textarea rows={2} value={suggestion} onChange={(e) => setSuggestion(e.target.value)} /></label>
      <label>علامات الخطر (متى يراجع الطبيب فوراً)<textarea rows={2} value={flags} onChange={(e) => setFlags(e.target.value)} /></label>
      <label>ملاحظة المراجعة<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="row actions">
        <button className="ghost" onClick={() => onSave(patch())}>حفظ التعديل</button>
        {canApprove && s.review_status !== 'approved' && (
          <button onClick={() => window.confirm(`اعتماد "${s.name_ar}"؟`) && onSave({ ...patch(), review_status: 'approved' })}>اعتماد</button>
        )}
      </div>
    </article>
  );
}
