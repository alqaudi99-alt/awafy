-- 0010 · Owner decisions 9 Nov 2026
--  1. Customers can order WITHOUT registering (guest = Supabase anonymous sign-in + contact name/phone).
--  2. Registered customers get a family health record: members, weight/length history, medicine list,
--     and a dose suggestion from the member's latest weight (approved clinical records only), with a
--     reminder when the weight is out of date.
--  3. Telemedicine / private clinics directory (verified by admin).
-- Nothing here drops or rewrites existing data.

-- ---------- helpers ----------
create or replace function private.is_registered()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;
revoke execute on function private.is_registered from public, anon;
grant execute on function private.is_registered to authenticated;

-- ---------- 1. Guest contact details ----------
alter table public.profiles
  add column contact_phone text check (contact_phone ~ '^\+968[279][0-9]{7}$');
grant update (contact_phone) on public.profiles to authenticated;

alter table public.orders
  add column contact_name text check (char_length(contact_name) <= 80),
  add column contact_phone text,
  add column is_guest boolean not null default false;

create or replace function private.create_order(
  p_uid uuid, p_pharmacy_id uuid, p_fulfilment text, p_address_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_fee numeric(10, 3); v_address text; v_subtotal numeric(10, 3); v_rx boolean;
  v_lines int; v_reserved int; v_status public.order_status;
  v_name text; v_phone text; v_guest boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  v_max_open int;
begin
  v_max_open := case when v_guest then 2 else 5 end;  -- guests: max 2 open orders
  select full_name, coalesce(phone, contact_phone) into v_name, v_phone from public.profiles where id = p_uid;
  if v_phone is null then raise exception 'A contact phone number is required'; end if;
  if v_guest and coalesce(trim(v_name), '') = '' then raise exception 'Please enter your name'; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Cart must contain between 1 and 50 items';
  end if;
  if (select count(*) from public.orders where customer_id = p_uid
        and status in ('awaiting_prescription', 'placed', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'))
     >= v_max_open then
    raise exception 'You have too many open orders; please wait for one to complete';
  end if;
  if p_fulfilment is null or p_fulfilment not in ('pickup', 'delivery', 'urgent_delivery') then
    raise exception 'Choose pickup, delivery or urgent delivery';
  end if;
  select case when p_fulfilment = 'urgent_delivery' then urgent_delivery_fee_omr else delivery_fee_omr end
    into v_fee from public.pharmacies where id = p_pharmacy_id and is_verified and is_active;
  if not found then raise exception 'Pharmacy is not available'; end if;

  if p_fulfilment in ('delivery', 'urgent_delivery') then
    if not (select delivery_enabled from public.platform_settings) then
      raise exception 'Home delivery is paused right now; please choose pickup';
    end if;
    if p_fulfilment = 'urgent_delivery' then
      if not (select urgent_delivery_enabled from public.platform_settings) then
        raise exception 'Urgent delivery is paused right now';
      end if;
      if v_fee is null then raise exception 'This pharmacy does not offer urgent delivery'; end if;
    end if;
    select details into v_address from public.addresses where id = p_address_id and user_id = p_uid;
    if not found then raise exception 'Delivery address not found'; end if;
  else
    v_fee := 0; v_address := null; p_address_id := null;
  end if;

  if exists (select 1 from (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty
                              from jsonb_array_elements(p_items) e group by 1) x
              where qty is null or qty < 1 or qty > 99 or product_id is null) then
    raise exception 'Invalid quantity';
  end if;
  select count(*) into v_lines from (select (e ->> 'product_id')::bigint from jsonb_array_elements(p_items) e group by 1) x;
  with l as (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty
               from jsonb_array_elements(p_items) e group by 1),
       upd as (update public.pharmacy_stock s set quantity = s.quantity - l.qty, updated_at = now()
                 from l, public.products p
                where s.pharmacy_id = p_pharmacy_id and s.product_id = l.product_id
                  and p.id = l.product_id and p.is_active and s.quantity >= l.qty
                returning s.product_id)
  select count(*) into v_reserved from upd;
  if v_reserved <> v_lines then raise exception 'Some items are not available in this quantity'; end if;

  select coalesce(sum(l.qty * s.price_omr), 0), coalesce(bool_or(p.requires_rx), false) into v_subtotal, v_rx
    from (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty
            from jsonb_array_elements(p_items) e group by 1) l
    join public.pharmacy_stock s on s.product_id = l.product_id and s.pharmacy_id = p_pharmacy_id
    join public.products p on p.id = l.product_id;
  v_status := case when v_rx then 'awaiting_prescription'::public.order_status else 'placed' end;

  insert into public.orders (customer_id, pharmacy_id, address_id, delivery_address, status, fulfilment, payment_method,
                             subtotal_omr, delivery_fee_omr, total_omr, requires_rx, contact_name, contact_phone, is_guest)
  values (p_uid, p_pharmacy_id, p_address_id, v_address, v_status, p_fulfilment,
          case when p_fulfilment = 'pickup' then 'pay_at_pharmacy' else 'cash_on_delivery' end,
          v_subtotal, v_fee, v_subtotal + v_fee, v_rx, left(trim(v_name), 80), v_phone, v_guest)
  returning id into v_order;

  insert into public.order_items (order_id, product_id, product_name, quantity, unit_price_omr)
  select v_order, p.id, p.name_ar, l.qty, s.price_omr
    from (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty
            from jsonb_array_elements(p_items) e group by 1) l
    join public.products p on p.id = l.product_id
    join public.pharmacy_stock s on s.product_id = p.id and s.pharmacy_id = p_pharmacy_id;

  if p_fulfilment = 'pickup' then
    insert into public.order_pickup_codes (order_id, code)
    values (v_order, lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0'));
  end if;
  insert into public.order_events (order_id, status, actor_id) values (v_order, v_status, p_uid);
  return v_order;
end $$;
revoke execute on function private.create_order from public, anon, authenticated;

-- ---------- 2. Family health record (registered customers only) ----------
create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  relation text not null default 'child' check (relation in ('self', 'spouse', 'child', 'parent', 'other')),
  sex text check (sex in ('male', 'female')),
  birth_date date check (birth_date between date '1900-01-01' and current_date),
  allergies text check (char_length(allergies) <= 500),
  conditions text check (char_length(conditions) <= 500),
  created_at timestamptz not null default now()
);
create index on public.family_members (owner_id);

create table public.member_measurements (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.family_members (id) on delete cascade,
  measured_on date not null default current_date check (measured_on <= current_date),
  weight_kg numeric(5, 2) check (weight_kg between 0.3 and 350),
  length_cm numeric(5, 1) check (length_cm between 30 and 250),
  created_at timestamptz not null default now(),
  check (weight_kg is not null or length_cm is not null)
);
create index on public.member_measurements (member_id, measured_on desc);

create table public.member_medications (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.family_members (id) on delete cascade,
  product_id bigint references public.products (id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  dose_text text check (char_length(dose_text) <= 200),
  started_on date,
  ended_on date,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);
create index on public.member_medications (member_id);

alter table public.family_members enable row level security;
alter table public.member_measurements enable row level security;
alter table public.member_medications enable row level security;

-- Only the registered account holder sees or changes their family record. Pharmacies, drivers and
-- admins have no access (sensitive health data).
create policy "owner manages family" on public.family_members for all to authenticated
  using (owner_id = auth.uid() and private.is_registered())
  with check (owner_id = auth.uid() and private.is_registered()
              and (select count(*) from public.family_members f where f.owner_id = auth.uid()) < 12);
create policy "owner manages measurements" on public.member_measurements for all to authenticated
  using (private.is_registered() and exists (select 1 from public.family_members f where f.id = member_id and f.owner_id = auth.uid()))
  with check (private.is_registered() and exists (select 1 from public.family_members f where f.id = member_id and f.owner_id = auth.uid()));
create policy "owner manages medications" on public.member_medications for all to authenticated
  using (private.is_registered() and exists (select 1 from public.family_members f where f.id = member_id and f.owner_id = auth.uid()))
  with check (private.is_registered() and exists (select 1 from public.family_members f where f.id = member_id and f.owner_id = auth.uid()));
revoke all on public.family_members, public.member_measurements, public.member_medications from anon;

-- Which family member an order is for (optional, set by the customer).
alter table public.orders add column family_member_id uuid references public.family_members (id) on delete set null;
create or replace function public.set_order_member(p_order_id uuid, p_member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_registered() then raise exception 'Login required'; end if;
  if p_member_id is not null and not exists (select 1 from public.family_members where id = p_member_id and owner_id = auth.uid()) then
    raise exception 'Family member not found';
  end if;
  update public.orders set family_member_id = p_member_id, updated_at = now()
   where id = p_order_id and customer_id = auth.uid();
  if not found then raise exception 'Order not found'; end if;
end $$;

-- Dosage records gain machine-readable age limits; products gain strength, and a reviewed link
-- between a product and its dosage records.
alter table public.dosage_reference
  add column min_age_months int check (min_age_months >= 0),
  add column max_age_months int check (max_age_months >= 0);
alter table public.products
  add column strength_mg numeric check (strength_mg > 0),
  add column strength_per numeric check (strength_per > 0),
  add column dose_unit text check (dose_unit in ('ml', 'tablet', 'capsule', 'sachet', 'suppository'));
comment on column public.products.strength_mg is 'Active ingredient mg per strength_per dose_unit, e.g. 120 mg per 5 ml';

create table public.product_dosage (
  product_id bigint not null references public.products (id) on delete cascade,
  dosage_id bigint not null references public.dosage_reference (id) on delete cascade,
  primary key (product_id, dosage_id)
);
alter table public.product_dosage enable row level security;
create policy "dosage links are public" on public.product_dosage for select to anon, authenticated using (true);
create policy "reviewers manage dosage links" on public.product_dosage for all to authenticated
  using (private.my_role() in ('admin', 'clinical_reviewer'))
  with check (private.my_role() in ('admin', 'clinical_reviewer'));

-- Dose suggestion for one family member and one product, from the latest weight.
-- Uses APPROVED dosage records only. Returns a status the app explains to the user.
create or replace function public.member_dose(p_member_id uuid, p_product_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m public.family_members%rowtype; w numeric; w_on date; age_m int; stale_days int; stale boolean;
  pr public.products%rowtype; d public.dosage_reference%rowtype;
  lo numeric; hi numeric; daily numeric; unit_lo numeric; unit_hi numeric; status text := 'ok';
begin
  if not private.is_registered() then raise exception 'Login required'; end if;
  select * into m from public.family_members where id = p_member_id and owner_id = auth.uid();
  if not found then raise exception 'Family member not found'; end if;
  select * into pr from public.products where id = p_product_id and is_active;
  if not found then raise exception 'Product not found'; end if;

  select weight_kg, measured_on into w, w_on from public.member_measurements
   where member_id = m.id and weight_kg is not null order by measured_on desc, id desc limit 1;
  age_m := case when m.birth_date is null then null
                else (extract(year from age(current_date, m.birth_date)) * 12 + extract(month from age(current_date, m.birth_date)))::int end;
  stale_days := case when age_m is null then 90 when age_m < 12 then 30 when age_m < 60 then 90 else 180 end;
  stale := w_on is null or w_on < current_date - stale_days;

  select dr.* into d from public.product_dosage pd join public.dosage_reference dr on dr.id = pd.dosage_id
   where pd.product_id = pr.id and dr.review_status = 'approved'
     and (dr.min_age_months is null or (age_m is not null and age_m >= dr.min_age_months))
     and (dr.max_age_months is null or (age_m is not null and age_m < dr.max_age_months))
     and (dr.min_weight_kg is null or (w is not null and w >= dr.min_weight_kg))
   order by dr.min_age_months desc nulls last, dr.min_weight_kg desc nulls last limit 1;

  if not found then
    status := case when not exists (select 1 from public.product_dosage where product_id = pr.id) then 'no_rule'
                   when not exists (select 1 from public.product_dosage pd join public.dosage_reference dr on dr.id = pd.dosage_id
                                     where pd.product_id = pr.id and dr.review_status = 'approved') then 'not_reviewed'
                   when w is null then 'no_weight'
                   when m.birth_date is null then 'no_age'
                   else 'no_matching_rule' end;
    return jsonb_build_object('status', status, 'weight_kg', w, 'weighed_on', w_on, 'weight_stale', stale,
                              'stale_after_days', stale_days, 'age_months', age_m);
  end if;

  if d.weight_based then
    if w is null then
      return jsonb_build_object('status', 'no_weight', 'weight_stale', true, 'age_months', age_m);
    end if;
    lo := d.per_kg_low * w; hi := coalesce(d.per_kg_high, d.per_kg_low) * w;
    if d.max_single_mg is not null then lo := least(lo, d.max_single_mg); hi := least(hi, d.max_single_mg); end if;
    lo := case when lo < 10 then round(lo, 1) else round(lo) end;
    hi := case when hi < 10 then round(hi, 1) else round(hi) end;
    daily := least(coalesce(d.max_daily_mg, 'infinity'::numeric), coalesce(d.max_daily_mg_per_kg * w, 'infinity'::numeric));
    if daily = 'infinity'::numeric then daily := null; else daily := round(daily); end if;
    if pr.strength_mg is not null and pr.strength_per is not null then
      unit_lo := lo / pr.strength_mg * pr.strength_per; unit_hi := hi / pr.strength_mg * pr.strength_per;
      if pr.dose_unit = 'ml' then unit_lo := round(unit_lo, 1); unit_hi := round(unit_hi, 1);
      else unit_lo := floor(unit_lo * 2) / 2; unit_hi := floor(unit_hi * 2) / 2;
           if unit_hi < 0.5 then status := 'use_liquid'; end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'status', status, 'weight_kg', w, 'weighed_on', w_on, 'weight_stale', stale, 'stale_after_days', stale_days,
    'age_months', age_m, 'weight_based', d.weight_based,
    'dose_mg_low', lo, 'dose_mg_high', hi, 'max_daily_mg', daily,
    'amount_low', unit_lo, 'amount_high', unit_hi, 'unit', pr.dose_unit,
    'dose_text', d.dose_text, 'frequency_ar', d.frequency_ar, 'frequency_en', d.frequency_en,
    'warnings_ar', d.warnings_ar, 'warnings_en', d.warnings_en,
    'reviewed_on', d.review_date);
end $$;

revoke execute on function public.set_order_member, public.member_dose from public, anon;
grant execute on function public.set_order_member, public.member_dose to authenticated;

-- ---------- 3. Clinics (telemedicine and private clinics) ----------
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null check (char_length(trim(name_ar)) between 2 and 120),
  name_en text check (char_length(name_en) <= 120),
  kind text not null default 'telemedicine' check (kind in ('telemedicine', 'clinic')),
  license_number text unique check (char_length(license_number) <= 60),
  specialties_ar text check (char_length(specialties_ar) <= 300),
  specialties_en text check (char_length(specialties_en) <= 300),
  hours_text text check (char_length(hours_text) <= 200),
  phone text check (phone ~ '^\+968[0-9]{8}$'),
  whatsapp text check (whatsapp ~ '^\+968[0-9]{8}$'),
  booking_url text check (booking_url ~ '^https://[^[:space:]]+$' and char_length(booking_url) <= 300),
  governorate text check (char_length(governorate) <= 60),
  is_verified boolean not null default false,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.clinics enable row level security;
create policy "verified clinics are public" on public.clinics for select to anon, authenticated
  using ((is_verified and is_active) or private.is_admin() or created_by = auth.uid());
create policy "admin manages clinics" on public.clinics for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- A clinic can apply; it stays hidden until an admin verifies it.
create or replace function public.register_clinic(
  p_name_ar text, p_kind text, p_license text, p_phone text, p_whatsapp text default null,
  p_booking_url text default null, p_specialties_ar text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_registered() then raise exception 'Login required'; end if;
  if (select count(*) from public.clinics where created_by = auth.uid()) >= 3 then
    raise exception 'Too many clinic applications';
  end if;
  insert into public.clinics (name_ar, kind, license_number, phone, whatsapp, booking_url, specialties_ar, created_by)
  values (trim(p_name_ar), coalesce(p_kind, 'telemedicine'), nullif(trim(p_license), ''), p_phone, p_whatsapp,
          nullif(trim(p_booking_url), ''), p_specialties_ar, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_set_clinic_verified(p_clinic_id uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  update public.clinics set is_verified = p_verified, updated_at = now() where id = p_clinic_id;
  if not found then raise exception 'Clinic not found'; end if;
end $$;
revoke execute on function public.register_clinic, public.admin_set_clinic_verified from public, anon;
grant execute on function public.register_clinic, public.admin_set_clinic_verified to authenticated;

-- Demo clinic for the dev database only (fictional).
insert into public.clinics (name_ar, name_en, kind, license_number, specialties_ar, specialties_en, hours_text,
                            phone, whatsapp, booking_url, governorate, is_verified, created_by)
values ('عيادة تجريبية للطب عن بُعد', 'Demo Telemedicine Clinic', 'telemedicine', 'DEMO-CLINIC-1',
        'طب عام، طب أطفال', 'General practice, paediatrics', 'يومياً 8 صباحاً - 10 مساءً',
        '+96890000000', '+96890000000', 'https://example.com/book', 'مسقط', true, null);
