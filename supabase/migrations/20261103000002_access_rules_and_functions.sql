-- Awafy access rules (RLS policies), safety triggers, and the server-side functions that
-- place orders and move them through their lifecycle.

-- =========================================================================
-- Helper functions (SECURITY DEFINER so policies can call them without recursion)
-- =========================================================================
create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_staff_of(p_pharmacy uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pharmacy_staff where pharmacy_id = p_pharmacy and user_id = auth.uid())
$$;

create or replace function public.can_see_order(p_order uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order
      and (o.customer_id = auth.uid() or o.driver_id = auth.uid()
           or public.is_staff_of(o.pharmacy_id) or public.is_admin())
  )
$$;

-- =========================================================================
-- New users get a customer profile automatically
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone, full_name)
  values (new.id, new.phone, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Nobody can promote themselves. Role changes: admin, trusted backend (no user), or our own functions.
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin()
     and coalesce(current_setting('awafy.role_change', true), '') <> 'on' then
    raise exception 'Only an administrator can change a user role';
  end if;
  return new;
end $$;

create trigger profiles_protect_role
  before update on public.profiles for each row execute function public.protect_profile_role();

-- Only admins can verify a pharmacy or approve a promotion.
create or replace function public.protect_admin_flags()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_table_name = 'pharmacies' and new.is_verified is distinct from old.is_verified then
      raise exception 'Only an administrator can verify a pharmacy';
    end if;
    if tg_table_name = 'promotions' and new.is_approved and (tg_op = 'INSERT' or not old.is_approved) then
      raise exception 'Only an administrator can approve a promotion';
    end if;
  end if;
  return new;
end $$;

create trigger pharmacies_protect_flags
  before update on public.pharmacies for each row execute function public.protect_admin_flags();
create trigger promotions_protect_flags
  before insert or update on public.promotions for each row execute function public.protect_admin_flags();

-- =========================================================================
-- Clinical content: approval only by a clinical reviewer; edits reset approval; full audit log
-- =========================================================================
create or replace function public.clinical_review_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  review_cols text[] := array['review_status', 'review_note', 'reviewed_by', 'review_date', 'updated_at'];
  content_changed boolean := false;
  reviewer boolean := public.my_role() = 'clinical_reviewer';
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    content_changed := (to_jsonb(new) - review_cols) is distinct from (to_jsonb(old) - review_cols);
    -- any content edit by a non-reviewer sends the record back for review
    if content_changed and not reviewer then
      new.review_status := 'pending_review';
      new.reviewed_by := null;
      new.review_date := null;
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

create or replace function public.clinical_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.clinical_audit_log (table_name, record_id, action, old_row, new_row, changed_by)
  values (tg_table_name,
          coalesce(new.id, old.id),
          tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$;

create trigger dosage_review_guard before insert or update on public.dosage_reference
  for each row execute function public.clinical_review_guard();
create trigger symptom_review_guard before insert or update on public.symptom_reference
  for each row execute function public.clinical_review_guard();
create trigger dosage_audit after insert or update or delete on public.dosage_reference
  for each row execute function public.clinical_audit();
create trigger symptom_audit after insert or update or delete on public.symptom_reference
  for each row execute function public.clinical_audit();

-- =========================================================================
-- Policies
-- =========================================================================
-- profiles
create policy "own profile or admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin()
         or exists (select 1 from public.orders o
                    where o.customer_id = profiles.id
                      and (public.is_staff_of(o.pharmacy_id) or o.driver_id = auth.uid())));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- pharmacies (registration happens through register_pharmacy())
create policy "verified pharmacies are public" on public.pharmacies for select to anon, authenticated
  using ((is_verified and is_active) or public.is_staff_of(id) or public.is_admin());
create policy "staff or admin update pharmacy" on public.pharmacies for update to authenticated
  using (public.is_staff_of(id) or public.is_admin())
  with check (public.is_staff_of(id) or public.is_admin());
create policy "admin deletes pharmacy" on public.pharmacies for delete to authenticated
  using (public.is_admin());

-- pharmacy_staff
create policy "see own staff links" on public.pharmacy_staff for select to authenticated
  using (user_id = auth.uid() or public.is_staff_of(pharmacy_id) or public.is_admin());
create policy "admin manages staff" on public.pharmacy_staff for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- categories and products
create policy "categories are public" on public.categories for select to anon, authenticated using (true);
create policy "admin manages categories" on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "active products are public" on public.products for select to anon, authenticated
  using (is_active or public.is_admin());
create policy "admin manages products" on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- stock and prices
create policy "stock of verified pharmacies is public" on public.pharmacy_stock for select to anon, authenticated
  using (exists (select 1 from public.pharmacies p
                 where p.id = pharmacy_id and p.is_verified and p.is_active)
         or public.is_staff_of(pharmacy_id) or public.is_admin());
create policy "staff manage own stock" on public.pharmacy_stock for all to authenticated
  using (public.is_staff_of(pharmacy_id) or public.is_admin())
  with check (public.is_staff_of(pharmacy_id) or public.is_admin());

-- promotions
create policy "approved promotions are public" on public.promotions for select to anon, authenticated
  using ((is_approved and starts_at <= now() and (ends_at is null or ends_at > now()))
         or public.is_staff_of(pharmacy_id) or public.is_admin());
create policy "staff create promotions" on public.promotions for insert to authenticated
  with check (public.is_staff_of(pharmacy_id) or public.is_admin());
create policy "staff edit promotions" on public.promotions for update to authenticated
  using (public.is_staff_of(pharmacy_id) or public.is_admin())
  with check (public.is_staff_of(pharmacy_id) or public.is_admin());
create policy "staff delete promotions" on public.promotions for delete to authenticated
  using (public.is_staff_of(pharmacy_id) or public.is_admin());

-- addresses: owner only
create policy "own addresses" on public.addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- orders, items, events: read-only to the parties; writes only through functions below
create policy "parties see order" on public.orders for select to authenticated
  using (customer_id = auth.uid() or driver_id = auth.uid()
         or public.is_staff_of(pharmacy_id) or public.is_admin());
create policy "parties see items" on public.order_items for select to authenticated
  using (public.can_see_order(order_id));
create policy "parties see events" on public.order_events for select to authenticated
  using (public.can_see_order(order_id));

-- prescriptions: customer and the order's pharmacy only (not the driver)
create policy "customer or pharmacy sees prescription" on public.prescriptions for select to authenticated
  using (customer_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.orders o
                    where o.id = order_id and public.is_staff_of(o.pharmacy_id)));

-- clinical content
create policy "approved clinical content is public" on public.dosage_reference for select to anon, authenticated
  using (review_status = 'approved' or public.my_role() in ('admin', 'clinical_reviewer'));
create policy "clinical staff edit dosage" on public.dosage_reference for insert to authenticated
  with check (public.my_role() in ('admin', 'clinical_reviewer'));
create policy "clinical staff update dosage" on public.dosage_reference for update to authenticated
  using (public.my_role() in ('admin', 'clinical_reviewer'))
  with check (public.my_role() in ('admin', 'clinical_reviewer'));
create policy "approved symptoms are public" on public.symptom_reference for select to anon, authenticated
  using (review_status = 'approved' or public.my_role() in ('admin', 'clinical_reviewer'));
create policy "clinical staff edit symptoms" on public.symptom_reference for insert to authenticated
  with check (public.my_role() in ('admin', 'clinical_reviewer'));
create policy "clinical staff update symptoms" on public.symptom_reference for update to authenticated
  using (public.my_role() in ('admin', 'clinical_reviewer'))
  with check (public.my_role() in ('admin', 'clinical_reviewer'));
create policy "clinical staff read audit" on public.clinical_audit_log for select to authenticated
  using (public.my_role() in ('admin', 'clinical_reviewer'));

-- =========================================================================
-- Server-side business functions
-- =========================================================================

-- Pharmacy self-registration: creates an UNVERIFIED pharmacy and links the caller as staff.
create or replace function public.register_pharmacy(
  p_name_ar text, p_name_en text, p_license text, p_phone text, p_address text,
  p_lat double precision default null, p_lng double precision default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Login required'; end if;
  if coalesce(trim(p_name_ar), '') = '' or coalesce(trim(p_license), '') = '' then
    raise exception 'Pharmacy name and licence number are required';
  end if;
  insert into public.pharmacies (name_ar, name_en, license_number, phone, address, lat, lng, created_by)
  values (trim(p_name_ar), p_name_en, trim(p_license), p_phone, p_address, p_lat, p_lng, v_uid)
  returning id into v_id;
  insert into public.pharmacy_staff (pharmacy_id, user_id) values (v_id, v_uid);
  perform set_config('awafy.role_change', 'on', true);
  update public.profiles set role = 'pharmacy_staff' where id = v_uid and role = 'customer';
  perform set_config('awafy.role_change', 'off', true);
  return v_id;
end $$;

-- Place an order. Prices come from the database, never from the app.
create or replace function public.place_order(p_pharmacy_id uuid, p_address_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_order uuid;
  v_fee numeric(10, 3);
  v_address text;
  v_subtotal numeric(10, 3) := 0;
  v_rx boolean := false;
  v_item record;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Cart must contain between 1 and 50 items';
  end if;

  select delivery_fee_omr into v_fee from public.pharmacies
   where id = p_pharmacy_id and is_verified and is_active;
  if not found then raise exception 'Pharmacy is not available'; end if;

  select details into v_address from public.addresses where id = p_address_id and user_id = v_uid;
  if not found then raise exception 'Delivery address not found'; end if;

  -- validate every line against live stock and price
  for v_item in
    select (e ->> 'product_id')::bigint as product_id, (e ->> 'quantity')::int as qty
      from jsonb_array_elements(p_items) e
  loop
    if v_item.qty is null or v_item.qty < 1 or v_item.qty > 99 then
      raise exception 'Invalid quantity';
    end if;
    perform 1 from public.pharmacy_stock s join public.products p on p.id = s.product_id
      where s.pharmacy_id = p_pharmacy_id and s.product_id = v_item.product_id
        and p.is_active and s.quantity >= v_item.qty;
    if not found then raise exception 'Product % is not available in this quantity', v_item.product_id; end if;
  end loop;

  insert into public.orders (customer_id, pharmacy_id, address_id, delivery_address, status,
                             subtotal_omr, delivery_fee_omr, total_omr)
  values (v_uid, p_pharmacy_id, p_address_id, v_address, 'placed', 0, v_fee, 0)
  returning id into v_order;

  insert into public.order_items (order_id, product_id, product_name, quantity, unit_price_omr)
  select v_order, p.id, p.name_ar, sum(l.qty)::int, s.price_omr
    from (select (e ->> 'product_id')::bigint as product_id, (e ->> 'quantity')::int as qty
            from jsonb_array_elements(p_items) e) l
    join public.products p on p.id = l.product_id
    join public.pharmacy_stock s on s.product_id = p.id and s.pharmacy_id = p_pharmacy_id
   group by p.id, p.name_ar, s.price_omr;

  select coalesce(sum(i.quantity * i.unit_price_omr), 0), coalesce(bool_or(p.requires_rx), false)
    into v_subtotal, v_rx
    from public.order_items i join public.products p on p.id = i.product_id
   where i.order_id = v_order;

  update public.orders
     set subtotal_omr = v_subtotal,
         total_omr = v_subtotal + v_fee,
         requires_rx = v_rx,
         status = case when v_rx then 'awaiting_prescription'::public.order_status else 'placed' end
   where id = v_order;

  insert into public.order_events (order_id, status, actor_id)
  values (v_order, case when v_rx then 'awaiting_prescription'::public.order_status else 'placed' end, v_uid);
  return v_order;
end $$;

-- Customer attaches a prescription image already uploaded to storage under "<user id>/..."
create or replace function public.attach_prescription(p_order_id uuid, p_storage_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_status public.order_status; v_id uuid;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  if p_storage_path is null or split_part(p_storage_path, '/', 1) <> v_uid::text or p_storage_path like '%..%' then
    raise exception 'Invalid prescription file';
  end if;
  select status into v_status from public.orders
   where id = p_order_id and customer_id = v_uid and requires_rx;
  if not found then raise exception 'Order not found'; end if;
  if v_status not in ('awaiting_prescription', 'placed') then
    raise exception 'Prescription can no longer be changed for this order';
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

-- Pharmacy approves or rejects a prescription.
create or replace function public.review_prescription(p_prescription_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_order uuid; v_pharmacy uuid;
begin
  select p.order_id, o.pharmacy_id into v_order, v_pharmacy
    from public.prescriptions p join public.orders o on o.id = p.order_id
   where p.id = p_prescription_id and p.status = 'pending';
  if not found then raise exception 'Prescription not found or already reviewed'; end if;
  if not (public.is_staff_of(v_pharmacy) or public.is_admin()) then raise exception 'Not allowed'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'A reason is required when rejecting a prescription';
  end if;
  update public.prescriptions
     set status = case when p_approve then 'approved'::public.rx_status else 'rejected' end,
         reviewed_by = v_uid, review_note = p_note, reviewed_at = now()
   where id = p_prescription_id;
  if not p_approve then
    update public.orders set status = 'awaiting_prescription', updated_at = now()
     where id = v_order and status = 'placed';
    insert into public.order_events (order_id, status, actor_id, note)
    values (v_order, 'awaiting_prescription', v_uid, 'Prescription rejected: ' || p_note);
  end if;
end $$;

-- Move an order through its lifecycle; who may do what is enforced here.
create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  o public.orders%rowtype;
  allowed boolean := false;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status in ('delivered', 'cancelled') then raise exception 'Order is already closed'; end if;

  if public.is_admin() then
    allowed := true;
  elsif o.customer_id = v_uid then
    allowed := p_status = 'cancelled' and o.status in ('awaiting_prescription', 'placed');
  elsif public.is_staff_of(o.pharmacy_id) then
    allowed := (o.status = 'placed' and p_status = 'accepted')
            or (o.status = 'accepted' and p_status = 'preparing')
            or (o.status = 'preparing' and p_status = 'out_for_delivery')
            or (p_status = 'cancelled');
  elsif o.driver_id = v_uid then
    allowed := o.status = 'out_for_delivery' and p_status = 'delivered';
  end if;
  if not allowed then raise exception 'This status change is not allowed'; end if;

  if p_status = 'accepted' and o.requires_rx and not exists (
       select 1 from public.prescriptions where order_id = o.id and status = 'approved') then
    raise exception 'An approved prescription is required before accepting this order';
  end if;
  if p_status = 'cancelled' and coalesce(trim(p_note), '') = '' then
    raise exception 'A reason is required to cancel';
  end if;

  update public.orders
     set status = p_status, updated_at = now(),
         cancel_reason = case when p_status = 'cancelled' then p_note else cancel_reason end
   where id = o.id;
  insert into public.order_events (order_id, status, actor_id, note) values (o.id, p_status, v_uid, p_note);
end $$;

-- Pharmacy assigns a driver.
create or replace function public.assign_driver(p_order_id uuid, p_driver_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pharmacy uuid;
begin
  select pharmacy_id into v_pharmacy from public.orders
   where id = p_order_id and status in ('accepted', 'preparing', 'out_for_delivery');
  if not found then raise exception 'Order not found or not ready for a driver'; end if;
  if not (public.is_staff_of(v_pharmacy) or public.is_admin()) then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.profiles where id = p_driver_id and role = 'driver') then
    raise exception 'Selected user is not a driver';
  end if;
  update public.orders set driver_id = p_driver_id, updated_at = now() where id = p_order_id;
end $$;

-- Function permissions: logged-in users only; helpers stay callable by policies.
revoke execute on function public.register_pharmacy, public.place_order, public.attach_prescription,
  public.review_prescription, public.set_order_status, public.assign_driver from public, anon;
grant execute on function public.register_pharmacy, public.place_order, public.attach_prescription,
  public.review_prescription, public.set_order_status, public.assign_driver to authenticated;
revoke execute on function public.handle_new_user, public.protect_profile_role, public.protect_admin_flags,
  public.clinical_review_guard, public.clinical_audit from public, anon, authenticated;

-- =========================================================================
-- Prescription file storage (private)
-- =========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prescriptions', 'prescriptions', false, 10485760,
        array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "customers upload own prescriptions" on storage.objects for insert to authenticated
  with check (bucket_id = 'prescriptions' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "customer or pharmacy reads prescription" on storage.objects for select to authenticated
  using (bucket_id = 'prescriptions' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.prescriptions p join public.orders o on o.id = p.order_id
               where p.storage_path = storage.objects.name
                 and (public.is_staff_of(o.pharmacy_id) or public.is_admin()))));

-- =========================================================================
-- Live order tracking
-- =========================================================================
alter publication supabase_realtime add table public.orders, public.order_events;
