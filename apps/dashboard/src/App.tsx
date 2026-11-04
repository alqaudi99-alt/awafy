import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import { NEXT_STEP, STATUS_AR, errorText, omr, supabase, type OrderStatus } from './supabase';

type Role = 'customer' | 'pharmacy_staff' | 'driver' | 'admin' | 'clinical_reviewer';
type Pharmacy = { id: string; name_ar: string; license_number: string; is_verified: boolean; phone: string | null };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return <p className="center">جارٍ التحميل…</p>;
  return session ? <Workspace session={session} /> : <Login />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const send = async () => {
    setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    if (error) setMsg(errorText(error));
    else setSent(true);
  };
  const verify = async () => {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) setMsg(errorText(error));
  };

  return (
    <main className="narrow">
      <h1>لوحة الصيدليات — عوافي</h1>
      <p>سجّل الدخول ببريدك الإلكتروني، وسنرسل لك رمز تحقق.</p>
      <label>
        البريد الإلكتروني
        <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      {sent && (
        <label>
          رمز التحقق
          <input inputMode="numeric" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
        </label>
      )}
      <button onClick={sent ? verify : send}>{sent ? 'تحقق' : 'أرسل الرمز'}</button>
      {msg && <p className="warn">{msg}</p>}
    </main>
  );
}

function Workspace({ session }: { session: Session }) {
  const [role, setRole] = useState<Role | null>(null);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [myIds, setMyIds] = useState<string[]>([]);
  const [tab, setTab] = useState<'orders' | 'stock' | 'admin'>('orders');

  const loadMe = useCallback(async () => {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
    setRole((profile?.role as Role) ?? 'customer');
    // Verified pharmacies are publicly readable, so "mine" comes from the staff link, not this list.
    const { data: links } = await supabase.from('pharmacy_staff').select('pharmacy_id').eq('user_id', session.user.id);
    setMyIds((links ?? []).map((l) => l.pharmacy_id));
    const { data } = await supabase.from('pharmacies').select('id, name_ar, license_number, is_verified, phone').order('name_ar');
    setPharmacies(data ?? []);
  }, [session.user.id]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  if (!role) return <p className="center">جارٍ التحميل…</p>;
  const isAdmin = role === 'admin';
  const mine = isAdmin ? pharmacies : pharmacies.filter((p) => myIds.includes(p.id));

  return (
    <div>
      <header className="top">
        <strong>عوافي — لوحة الصيدليات</strong>
        <span className="dev">نسخة تطوير — بيانات تجريبية</span>
        <nav>
          <button className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>الطلبات</button>
          <button className={tab === 'stock' ? 'on' : ''} onClick={() => setTab('stock')}>المخزون والأسعار</button>
          {isAdmin && <button className={tab === 'admin' ? 'on' : ''} onClick={() => setTab('admin')}>الصيدليات</button>}
          <button className="ghost" onClick={() => supabase.auth.signOut()}>خروج</button>
        </nav>
      </header>
      <main>
        {role === 'customer' || mine.length === 0 ? (
          <RegisterPharmacy onDone={loadMe} />
        ) : !isAdmin && mine.every((p) => !p.is_verified) ? (
          <p className="notice">صيدليتك قيد التحقق من الترخيص. ستظهر للعملاء بعد اعتمادها من إدارة عوافي.</p>
        ) : tab === 'orders' ? (
          <Orders />
        ) : tab === 'stock' ? (
          <Stock pharmacies={mine} />
        ) : (
          <AdminPharmacies pharmacies={pharmacies} onChange={loadMe} />
        )}
      </main>
    </div>
  );
}

function RegisterPharmacy({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name_ar: '', name_en: '', license: '', phone: '', address: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    const { error } = await supabase.rpc('register_pharmacy', {
      p_name_ar: form.name_ar,
      p_name_en: form.name_en || null,
      p_license: form.license,
      p_phone: form.phone || null,
      p_address: form.address || null,
    });
    if (error) setMsg(errorText(error));
    else onDone();
  };

  return (
    <section className="narrow">
      <h2>تسجيل صيدلية شريكة</h2>
      <p>تُراجع إدارة عوافي رقم الترخيص قبل ظهور الصيدلية للعملاء.</p>
      <label>اسم الصيدلية (عربي)<input value={form.name_ar} onChange={set('name_ar')} /></label>
      <label>اسم الصيدلية (إنجليزي)<input dir="ltr" value={form.name_en} onChange={set('name_en')} /></label>
      <label>رقم ترخيص وزارة الصحة<input dir="ltr" value={form.license} onChange={set('license')} /></label>
      <label>الهاتف<input dir="ltr" value={form.phone} onChange={set('phone')} /></label>
      <label>العنوان<input value={form.address} onChange={set('address')} /></label>
      <button onClick={submit} disabled={!form.name_ar || !form.license}>إرسال للتحقق</button>
      {msg && <p className="warn">{msg}</p>}
    </section>
  );
}

type OrderRow = {
  id: string;
  status: OrderStatus;
  total_omr: number;
  delivery_address: string;
  requires_rx: boolean;
  created_at: string;
  customer_id: string;
  order_items: { id: number; product_name: string; quantity: number; unit_price_omr: number }[];
  prescriptions: { id: string; status: 'pending' | 'approved' | 'rejected'; storage_path: string; review_note: string | null }[];
};

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // audio blocked until the user interacts with the page
  }
}

function Orders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    let q = supabase
      .from('orders')
      .select('id, status, total_omr, delivery_address, requires_rx, created_at, customer_id, order_items(id, product_name, quantity, unit_price_omr), prescriptions(id, status, storage_path, review_note)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (filter === 'open') q = q.not('status', 'in', '(delivered,cancelled)');
    const { data, error } = await q.returns<OrderRow[]>();
    if (error) return setMsg(errorText(error));
    setOrders(data ?? []);
    const ids = [...new Set((data ?? []).map((o) => o.customer_id))];
    if (ids.length) {
      const { data: people } = await supabase.from('profiles').select('id, phone, full_name').in('id', ids);
      setPhones(Object.fromEntries((people ?? []).map((p) => [p.id, [p.full_name, p.phone].filter(Boolean).join(' · ')])));
    }
  }, [filter]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('pharmacy-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
        beep();
        load();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const act = async (fn: () => PromiseLike<{ error: unknown }>) => {
    setMsg(null);
    const { error } = await fn();
    if (error) setMsg(errorText(error));
    load();
  };

  const viewRx = async (path: string) => {
    // Short-lived private link; the file is never public.
    const { data, error } = await supabase.storage.from('prescriptions').createSignedUrl(path, 120);
    if (error || !data) return setMsg(errorText(error));
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  return (
    <section>
      <div className="row">
        <h2>الطلبات</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value as 'open' | 'all')}>
          <option value="open">المفتوحة</option>
          <option value="all">الكل</option>
        </select>
      </div>
      {msg && <p className="warn">{msg}</p>}
      {orders.length === 0 && <p>لا توجد طلبات.</p>}
      {orders.map((o) => {
        const rx = o.prescriptions.at(-1);
        const next = NEXT_STEP[o.status];
        return (
          <article key={o.id} className={`card status-${o.status}`}>
            <div className="row">
              <strong dir="ltr">#{o.id.slice(0, 8).toUpperCase()}</strong>
              <span className="pill">{STATUS_AR[o.status]}</span>
            </div>
            <p className="muted">
              {new Date(o.created_at).toLocaleString('ar-OM')} · {phones[o.customer_id] ?? ''}
            </p>
            <p>{o.delivery_address}</p>
            <ul>
              {o.order_items.map((i) => (
                <li key={i.id}>
                  {i.quantity} × {i.product_name} — {omr(i.quantity * i.unit_price_omr)}
                </li>
              ))}
            </ul>
            <p>
              <strong>الإجمالي: {omr(o.total_omr)}</strong> (الدفع عند الاستلام)
            </p>
            {o.requires_rx && (
              <div className="rx">
                <strong>الوصفة الطبية: </strong>
                {!rx && 'لم تُرفع بعد'}
                {rx && (
                  <>
                    {rx.status === 'pending' ? 'بانتظار مراجعتك' : rx.status === 'approved' ? 'معتمدة' : `مرفوضة: ${rx.review_note ?? ''}`}{' '}
                    <button className="ghost" onClick={() => viewRx(rx.storage_path)}>عرض</button>
                    {rx.status === 'pending' && (
                      <>
                        <button onClick={() => act(() => supabase.rpc('review_prescription', { p_prescription_id: rx.id, p_approve: true }))}>
                          اعتماد
                        </button>
                        <button
                          className="danger"
                          onClick={() => {
                            const reason = window.prompt('سبب رفض الوصفة (سيظهر للعميل):');
                            if (reason) act(() => supabase.rpc('review_prescription', { p_prescription_id: rx.id, p_approve: false, p_note: reason }));
                          }}>
                          رفض
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="row actions">
              {next && (
                <button onClick={() => act(() => supabase.rpc('set_order_status', { p_order_id: o.id, p_status: next.to }))}>{next.label}</button>
              )}
              {!['delivered', 'cancelled'].includes(o.status) && (
                <button
                  className="danger ghost"
                  onClick={() => {
                    const reason = window.prompt('سبب الإلغاء (سيظهر للعميل):');
                    if (reason) act(() => supabase.rpc('set_order_status', { p_order_id: o.id, p_status: 'cancelled', p_note: reason }));
                  }}>
                  إلغاء
                </button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

type StockRow = { pharmacy_id: string; product_id: number; price_omr: number; quantity: number; products: { name_ar: string } | null };

function Stock({ pharmacies }: { pharmacies: Pharmacy[] }) {
  const [pharmacyId, setPharmacyId] = useState(pharmacies[0]?.id ?? '');
  const [rows, setRows] = useState<StockRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!pharmacyId) return;
    const { data, error } = await supabase
      .from('pharmacy_stock')
      .select('pharmacy_id, product_id, price_omr, quantity, products(name_ar)')
      .eq('pharmacy_id', pharmacyId)
      .returns<StockRow[]>();
    if (error) setMsg(errorText(error));
    else setRows((data ?? []).sort((a, b) => (a.products?.name_ar ?? '').localeCompare(b.products?.name_ar ?? '', 'ar')));
  }, [pharmacyId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (row: StockRow, price: number, qty: number) => {
    setMsg(null);
    if (!(price > 0) || qty < 0 || !Number.isInteger(qty)) return setMsg('السعر يجب أن يكون أكبر من صفر والكمية رقماً صحيحاً.');
    const { error } = await supabase
      .from('pharmacy_stock')
      .update({ price_omr: price, quantity: qty, updated_at: new Date().toISOString() })
      .eq('pharmacy_id', row.pharmacy_id)
      .eq('product_id', row.product_id);
    setMsg(error ? errorText(error) : 'تم الحفظ');
    load();
  };

  return (
    <section>
      <div className="row">
        <h2>المخزون والأسعار</h2>
        {pharmacies.length > 1 && (
          <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
            {pharmacies.map((p) => (
              <option key={p.id} value={p.id}>{p.name_ar}</option>
            ))}
          </select>
        )}
      </div>
      {msg && <p className="notice">{msg}</p>}
      <table>
        <thead>
          <tr><th>المنتج</th><th>السعر (ر.ع)</th><th>الكمية</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <StockLine key={r.product_id} row={r} onSave={save} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function StockLine({ row, onSave }: { row: StockRow; onSave: (r: StockRow, price: number, qty: number) => void }) {
  const [price, setPrice] = useState(String(row.price_omr));
  const [qty, setQty] = useState(String(row.quantity));
  const dirty = price !== String(row.price_omr) || qty !== String(row.quantity);
  return (
    <tr>
      <td>{row.products?.name_ar}</td>
      <td><input dir="ltr" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="السعر" /></td>
      <td><input dir="ltr" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="الكمية" /></td>
      <td><button disabled={!dirty} onClick={() => onSave(row, Number(price), Number(qty))}>حفظ</button></td>
    </tr>
  );
}

function AdminPharmacies({ pharmacies, onChange }: { pharmacies: Pharmacy[]; onChange: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = async (p: Pharmacy) => {
    const ok = window.confirm(p.is_verified ? `إيقاف اعتماد ${p.name_ar}؟` : `اعتماد ${p.name_ar} بعد التحقق من الترخيص ${p.license_number}؟`);
    if (!ok) return;
    // Verification goes through an admin-only database function (security review #1).
    const { error } = await supabase.rpc('admin_set_pharmacy_verified', { p_pharmacy_id: p.id, p_verified: !p.is_verified });
    setMsg(error ? errorText(error) : null);
    onChange();
  };
  return (
    <section>
      <h2>الصيدليات</h2>
      {msg && <p className="warn">{msg}</p>}
      <table>
        <thead><tr><th>الاسم</th><th>الترخيص</th><th>الحالة</th><th /></tr></thead>
        <tbody>
          {pharmacies.map((p) => (
            <tr key={p.id}>
              <td>{p.name_ar}</td>
              <td dir="ltr">{p.license_number}</td>
              <td>{p.is_verified ? 'معتمدة' : 'بانتظار التحقق'}</td>
              <td><button className={p.is_verified ? 'ghost' : ''} onClick={() => toggle(p)}>{p.is_verified ? 'إيقاف' : 'اعتماد'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
