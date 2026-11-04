-- Fixes from the independent security review (3 Nov 2026). Items numbered as in the review.

-- #1 Pharmacies: staff may edit only operational fields; licence/name/verification go through admin.
revoke update on public.pharmacies from authenticated;
grant update (phone, address, lat, lng, delivery_fee_omr, is_active, name_en) on public.pharmacies to authenticated;
alter table public.pharmacies add constraint pharmacies_fee_cap check (delivery_fee_omr <= 5);

create or replace function public.admin_set_pharmacy_verified(p_pharmacy_id uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  update public.pharmacies set is_verified = p_verified where id = p_pharmacy_id;
  if not found then raise exception 'Pharmacy not found'; end if;
end $$;

-- #2 Promotions: any wording/date change by non-admin staff withdraws the approval.
create or replace function public.protect_admin_flags()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    if tg_table_name = 'pharmacies' and new.is_verified is distinct from old.is_verified then
      raise exception 'Only an administrator can verify a pharmacy';
    end if;
    if tg_table_name = 'promotions' then
      if new.is_approved and (tg_op = 'INSERT' or not old.is_approved) then
        raise exception 'Only an administrator can approve a promotion';
      end if;
      if tg_op = 'UPDATE' and old.is_approved
         and (new.text_ar, new.text_en, new.starts_at, new.ends_at, new.pharmacy_id)
             is distinct from (old.text_ar, old.text_en, old.starts_at, old.ends_at, old.pharmacy_id) then
        new.is_approved := false;
      end if;
    end if;
  end if;
  return new;
end $$;

-- #3 Profiles: users edit only name and language; phone mirrors the verified login number.
revoke update on public.profiles from authenticated;
grant update (full_name, preferred_lang) on public.profiles to authenticated;

create or replace function public.sync_profile_phone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is distinct from old.phone then
    update public.profiles set phone = new.phone where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_phone_changed
  after update of phone on auth.users for each row execute function public.sync_profile_phone();

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  if p_user_id = auth.uid() then raise exception 'Administrators cannot change their own role'; end if;
  perform set_config('awafy.role_change', 'on', true);
  update public.profiles set role = p_role where id = p_user_id;
  perform set_config('awafy.role_change', 'off', true);
  if not found then raise exception 'User not found'; end if;
end $$;

-- #5 Drivers see the delivery (address, total, status) but not medicines or clinical notes.
create or replace function private.can_see_order_details(p_order uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order
      and (o.customer_id = auth.uid() or private.is_staff_of(o.pharmacy_id) or private.is_admin())
  )
$$;
drop policy "parties see items" on public.order_items;
drop policy "parties see events" on public.order_events;
create policy "customer and pharmacy see items" on public.order_items for select to authenticated
  using (private.can_see_order_details(order_id));
create policy "customer and pharmacy see events" on public.order_events for select to authenticated
  using (private.can_see_order_details(order_id));

-- #6 Prescriptions: file must exist, one active prescription per order, a file cannot be reused.
create unique index prescriptions_storage_path_key on public.prescriptions (storage_path);

create or replace function public.attach_prescription(p_order_id uuid, p_storage_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_status public.order_status; v_id uuid;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  if p_storage_path is null or split_part(p_storage_path, '/', 1) <> v_uid::text or p_storage_path like '%..%' then
    raise exception 'Invalid prescription file';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'prescriptions' and name = p_storage_path) then
    raise exception 'Prescription file not found; please upload it again';
  end if;
  if exists (select 1 from public.prescriptions where storage_path = p_storage_path) then
    raise exception 'This prescription file is already used';
  end if;
  select status into v_status from public.orders
   where id = p_order_id and customer_id = v_uid and requires_rx for update;
  if not found then raise exception 'Order not found'; end if;
  if v_status not in ('awaiting_prescription', 'placed') then
    raise exception 'Prescription can no longer be changed for this order';
  end if;
  if exists (select 1 from public.prescriptions where order_id = p_order_id and status in ('pending', 'approved')) then
    raise exception 'A prescription for this order is already under review or approved';
  end if;
  insert into public.prescriptions (order_id, customer_id, storage_path)
  values (p_order_id, v_uid, p_storage_path) returning id into v_id;
  if v_status = 'awaiting_prescription' then
    update public.orders set status = 'placed', updated_at = now() where id = p_order_id;
    insert into public.order_events (order_id, status, actor_id, note)
    values (p_order_id, 'placed', v_uid, 'Prescription uploaded');
  end if;
  return v_id;
end $$;

-- Rejection reasons stay on the prescription (visible to customer and pharmacy), not in the shared history.
create or replace function public.review_prescription(p_prescription_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_order uuid; v_pharmacy uuid;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  select p.order_id, o.pharmacy_id into v_order, v_pharmacy
    from public.prescriptions p join public.orders o on o.id = p.order_id
   where p.id = p_prescription_id and p.status = 'pending';
  if not found then raise exception 'Prescription not found or already reviewed'; end if;
  if not (private.is_staff_of(v_pharmacy) or private.is_admin()) then raise exception 'Not allowed'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'A reason is required when rejecting a prescription';
  end if;
  update public.prescriptions
     set status = case when p_approve then 'approved'::public.rx_status else 'rejected' end,
         reviewed_by = v_uid, review_note = left(p_note, 500), reviewed_at = now()
   where id = p_prescription_id;
  if not p_approve then
    update public.orders set status = 'awaiting_prescription', updated_at = now()
     where id = v_order and status = 'placed';
    insert into public.order_events (order_id, status, actor_id, note)
    values (v_order, 'awaiting_prescription', v_uid, 'Prescription not accepted');
  end if;
end $$;

-- #4 + #10 Status changes: admins follow the same flow; Rx gate applies to every fulfilment step;
-- an order cannot go out for delivery without a driver.
create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  o public.orders%rowtype;
  is_admin boolean := private.is_admin();
  staff_step boolean;
  allowed boolean := false;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status in ('delivered', 'cancelled') then raise exception 'Order is already closed'; end if;

  staff_step := (o.status = 'placed' and p_status = 'accepted')
             or (o.status = 'accepted' and p_status = 'preparing')
             or (o.status = 'preparing' and p_status = 'out_for_delivery')
             or p_status = 'cancelled';

  if o.customer_id = v_uid and not is_admin then
    allowed := p_status = 'cancelled' and o.status in ('awaiting_prescription', 'placed');
  elsif is_admin or private.is_staff_of(o.pharmacy_id) then
    allowed := staff_step or (is_admin and o.status = 'out_for_delivery' and p_status = 'delivered');
  elsif o.driver_id = v_uid then
    allowed := o.status = 'out_for_delivery' and p_status = 'delivered';
  end if;
  if not allowed then raise exception 'This status change is not allowed'; end if;

  if p_status in ('accepted', 'preparing', 'out_for_delivery', 'delivered') and o.requires_rx
     and not exists (select 1 from public.prescriptions where order_id = o.id and status = 'approved') then
    raise exception 'An approved prescription is required before accepting this order';
  end if;
  if p_status = 'out_for_delivery' and o.driver_id is null then
    raise exception 'Assign a driver before sending the order out';
  end if;
  if p_status = 'cancelled' and coalesce(trim(p_note), '') = '' then
    raise exception 'A reason is required to cancel';
  end if;
  if is_admin and p_status = 'delivered' and coalesce(trim(p_note), '') = '' then
    raise exception 'A note is required when an administrator closes an order';
  end if;

  update public.orders
     set status = p_status, updated_at = now(),
         cancel_reason = case when p_status = 'cancelled' then left(p_note, 500) else cancel_reason end
   where id = o.id;
  insert into public.order_events (order_id, status, actor_id, note) values (o.id, p_status, v_uid, left(p_note, 500));
end $$;

create or replace function public.assign_driver(p_order_id uuid, p_driver_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pharmacy uuid; v_status public.order_status;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  select pharmacy_id, status into v_pharmacy, v_status from public.orders
   where id = p_order_id and status in ('accepted', 'preparing', 'out_for_delivery') for update;
  if not found then raise exception 'Order not found or not ready for a driver'; end if;
  if not (private.is_staff_of(v_pharmacy) or private.is_admin()) then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.profiles where id = p_driver_id and role = 'driver') then
    raise exception 'Selected user is not a driver';
  end if;
  update public.orders set driver_id = p_driver_id, updated_at = now() where id = p_order_id;
  insert into public.order_events (order_id, status, actor_id, note) values (p_order_id, v_status, auth.uid(), 'Driver assigned');
end $$;

-- #7 Clinical sign-off cannot be forged: only a reviewer sets reviewer/date; edits by others clear it.
create or replace function public.clinical_review_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  review_cols text[] := array['review_status', 'review_note', 'reviewed_by', 'review_date', 'updated_at'];
  content_changed boolean := false;
  reviewer boolean := private.my_role() = 'clinical_reviewer';
begin
  new.updated_at := now();
  if tg_op = 'INSERT' and not reviewer then
    new.reviewed_by := null;
    new.review_date := null;
  end if;
  if tg_op = 'UPDATE' then
    content_changed := (to_jsonb(new) - review_cols) is distinct from (to_jsonb(old) - review_cols);
    if not reviewer then
      if content_changed then
        new.review_status := 'pending_review';
        new.reviewed_by := null;
        new.review_date := null;
      else
        new.reviewed_by := old.reviewed_by;
        new.review_date := old.review_date;
      end if;
    end if;
  end if;
  if new.review_status = 'approved'
     and (tg_op = 'INSERT' or old.review_status <> 'approved' or content_changed) then
    if not reviewer then
      raise exception 'Only a clinical reviewer (licensed pharmacist) can approve clinical content';
    end if;
    new.reviewed_by := auth.uid();
    new.review_date := now();
  end if;
  return new;
end $$;

-- #9 (partial) place_order: check summed quantity per product, cap open orders per customer.
create or replace function public.place_order(p_pharmacy_id uuid, p_address_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_order uuid;
  v_fee numeric(10, 3);
  v_address text;
  v_subtotal numeric(10, 3);
  v_rx boolean;
  v_lines int;
  v_ok int;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Cart must contain between 1 and 50 items';
  end if;
  if (select count(*) from public.orders
       where customer_id = v_uid and status in ('awaiting_prescription', 'placed', 'accepted', 'preparing')) >= 5 then
    raise exception 'You have too many open orders; please wait for one to complete';
  end if;

  select delivery_fee_omr into v_fee from public.pharmacies
   where id = p_pharmacy_id and is_verified and is_active;
  if not found then raise exception 'Pharmacy is not available'; end if;
  select details into v_address from public.addresses where id = p_address_id and user_id = v_uid;
  if not found then raise exception 'Delivery address not found'; end if;

  if exists (select 1 from (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty from jsonb_array_elements(p_items) e group by 1) x where qty is null or qty < 1 or qty > 99 or product_id is null) then
    raise exception 'Invalid quantity';
  end if;
  select count(*) into v_lines from (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty from jsonb_array_elements(p_items) e group by 1) x;
  select count(*) into v_ok
    from (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty from jsonb_array_elements(p_items) e group by 1) l
    join public.pharmacy_stock s on s.product_id = l.product_id and s.pharmacy_id = p_pharmacy_id
    join public.products p on p.id = l.product_id
   where p.is_active and s.quantity >= l.qty;
  if v_ok <> v_lines then raise exception 'Some items are not available in this quantity'; end if;

  select coalesce(sum(l.qty * s.price_omr), 0), coalesce(bool_or(p.requires_rx), false)
    into v_subtotal, v_rx
    from (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty from jsonb_array_elements(p_items) e group by 1) l
    join public.pharmacy_stock s on s.product_id = l.product_id and s.pharmacy_id = p_pharmacy_id
    join public.products p on p.id = l.product_id;

  insert into public.orders (customer_id, pharmacy_id, address_id, delivery_address, status,
                             subtotal_omr, delivery_fee_omr, total_omr, requires_rx)
  values (v_uid, p_pharmacy_id, p_address_id, v_address,
          case when v_rx then 'awaiting_prescription'::public.order_status else 'placed' end,
          v_subtotal, v_fee, v_subtotal + v_fee, v_rx)
  returning id into v_order;

  insert into public.order_items (order_id, product_id, product_name, quantity, unit_price_omr)
  select v_order, p.id, p.name_ar, l.qty, s.price_omr
    from (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty from jsonb_array_elements(p_items) e group by 1) l
    join public.products p on p.id = l.product_id
    join public.pharmacy_stock s on s.product_id = p.id and s.pharmacy_id = p_pharmacy_id;

  insert into public.order_events (order_id, status, actor_id)
  values (v_order, case when v_rx then 'awaiting_prescription'::public.order_status else 'placed' end, v_uid);
  return v_order;
end $$;

-- #12 (partial) Only customers or existing pharmacy staff may register a pharmacy.
create or replace function public.register_pharmacy(
  p_name_ar text, p_name_en text, p_license text, p_phone text, p_address text,
  p_lat double precision default null, p_lng double precision default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Login required'; end if;
  if private.my_role() not in ('customer', 'pharmacy_staff') then
    raise exception 'This account type cannot register a pharmacy';
  end if;
  if (select count(*) from public.pharmacies where created_by = v_uid) >= 3 then
    raise exception 'Too many pharmacy registrations for this account';
  end if;
  if coalesce(trim(p_name_ar), '') = '' or coalesce(trim(p_license), '') = '' then
    raise exception 'Pharmacy name and licence number are required';
  end if;
  insert into public.pharmacies (name_ar, name_en, license_number, phone, address, lat, lng, created_by)
  values (left(trim(p_name_ar), 120), left(p_name_en, 120), left(trim(p_license), 60), left(p_phone, 30),
          left(p_address, 300), p_lat, p_lng, v_uid)
  returning id into v_id;
  insert into public.pharmacy_staff (pharmacy_id, user_id) values (v_id, v_uid);
  perform set_config('awafy.role_change', 'on', true);
  update public.profiles set role = 'pharmacy_staff' where id = v_uid and role = 'customer';
  perform set_config('awafy.role_change', 'off', true);
  return v_id;
end $$;

-- Nice-to-have: length limits on free text.
alter table public.addresses add constraint addresses_details_len check (char_length(details) <= 500),
                             add constraint addresses_label_len check (char_length(label) <= 60);
alter table public.profiles add constraint profiles_name_len check (char_length(full_name) <= 100);
alter table public.promotions add constraint promotions_text_len check (char_length(text_ar) <= 200 and char_length(coalesce(text_en, '')) <= 200);

-- Permissions for the new functions.
revoke execute on function public.admin_set_pharmacy_verified, public.admin_set_user_role from public, anon;
grant execute on function public.admin_set_pharmacy_verified, public.admin_set_user_role to authenticated;
revoke execute on function public.sync_profile_phone from public, anon, authenticated;
revoke execute on function private.can_see_order_details from public;
grant execute on function private.can_see_order_details to anon, authenticated;
