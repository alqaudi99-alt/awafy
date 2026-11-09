-- 0012 · Owner decision 9 Nov 2026: medicines that need an ORIGINAL prescription with the doctor's stamp
-- ("restricted") are visible and can be ordered and prepared, but only collected at the pharmacy, where the
-- patient hands the original prescription to the pharmacist. The pharmacist must record that the original was
-- received and checked before the order can be handed over. No delivery for these orders.
-- Nothing here drops or rewrites existing data.

alter table public.products
  add column restricted boolean not null default false,
  add constraint products_restricted_needs_rx check (not restricted or requires_rx);
comment on column public.products.restricted is
  'Needs the original stamped prescription handed in at the pharmacy; pickup only';

alter table public.orders
  add column has_restricted boolean not null default false,
  add column original_rx_checked_by uuid references auth.users (id) on delete set null,
  add column original_rx_checked_at timestamptz;

-- Order creation: restricted items force pickup; the order can be prepared straight away (status "placed"),
-- because the prescription check happens at the counter on the original paper.
create or replace function private.create_order(
  p_uid uuid, p_pharmacy_id uuid, p_fulfilment text, p_address_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_fee numeric(10, 3); v_address text; v_subtotal numeric(10, 3); v_rx boolean; v_restricted boolean;
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

  select coalesce(bool_or(p.restricted), false) into v_restricted
    from jsonb_array_elements(p_items) e join public.products p on p.id = (e ->> 'product_id')::bigint;
  if v_restricted and p_fulfilment <> 'pickup' then
    raise exception 'Medicines that need an original stamped prescription can only be collected from the pharmacy';
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
  v_status := case when v_rx and not v_restricted then 'awaiting_prescription'::public.order_status else 'placed' end;

  insert into public.orders (customer_id, pharmacy_id, address_id, delivery_address, status, fulfilment, payment_method,
                             subtotal_omr, delivery_fee_omr, total_omr, requires_rx, has_restricted,
                             contact_name, contact_phone, is_guest)
  values (p_uid, p_pharmacy_id, p_address_id, v_address, v_status, p_fulfilment,
          case when p_fulfilment = 'pickup' then 'pay_at_pharmacy' else 'cash_on_delivery' end,
          v_subtotal, v_fee, v_subtotal + v_fee, v_rx, v_restricted, left(trim(v_name), 80), v_phone, v_guest)
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

-- Status flow: an uploaded, approved prescription is still required for ordinary prescription orders.
-- Orders with restricted items skip that step; the original is checked at the counter instead.
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
  if o.status in ('delivered', 'collected', 'cancelled') then raise exception 'Order is already closed'; end if;
  if p_status = 'collected' then raise exception 'Use the pickup code to hand over the order'; end if;

  staff_step := (o.status = 'placed' and p_status = 'accepted')
             or (o.status = 'accepted' and p_status = 'preparing')
             or (o.fulfilment = 'pickup' and o.status = 'preparing' and p_status = 'ready_for_pickup')
             or (o.fulfilment <> 'pickup' and o.status = 'preparing' and p_status = 'out_for_delivery')
             or p_status = 'cancelled';

  if o.customer_id = v_uid and not is_admin then
    allowed := p_status = 'cancelled' and o.status in ('awaiting_prescription', 'placed');
  elsif is_admin or private.is_staff_of(o.pharmacy_id) then
    allowed := staff_step or (is_admin and o.fulfilment <> 'pickup' and o.status = 'out_for_delivery' and p_status = 'delivered');
  elsif o.driver_id = v_uid then
    allowed := o.fulfilment <> 'pickup' and o.status = 'out_for_delivery' and p_status = 'delivered';
  end if;
  if not allowed then raise exception 'This status change is not allowed'; end if;

  if p_status in ('accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered')
     and o.requires_rx and not o.has_restricted
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

-- The pharmacist records that the original stamped prescription was handed in and checked.
create or replace function public.confirm_original_rx(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); o public.orders%rowtype;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not (private.is_staff_of(o.pharmacy_id) or private.is_admin()) then raise exception 'Not allowed'; end if;
  if not o.has_restricted then raise exception 'This order does not need an original prescription'; end if;
  if o.status <> 'ready_for_pickup' then raise exception 'Order is not ready for pickup'; end if;
  update public.orders set original_rx_checked_by = v_uid, original_rx_checked_at = now(), updated_at = now() where id = o.id;
  insert into public.order_events (order_id, status, actor_id, note)
  values (o.id, o.status, v_uid, 'Original stamped prescription received and checked');
end $$;

-- Hand-over: ordinary prescription orders need an approved upload; restricted orders need the original checked.
create or replace function public.collect_order(p_order_id uuid, p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); o public.orders%rowtype; c public.order_pickup_codes%rowtype;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not (private.is_staff_of(o.pharmacy_id) or private.is_admin()) then raise exception 'Not allowed'; end if;
  if o.status <> 'ready_for_pickup' then raise exception 'Order is not ready for pickup'; end if;
  if o.has_restricted and o.original_rx_checked_at is null then
    raise exception 'Receive and check the original stamped prescription before hand-over';
  end if;
  if o.requires_rx and not o.has_restricted
     and not exists (select 1 from public.prescriptions where order_id = o.id and status = 'approved') then
    raise exception 'An approved prescription is required before hand-over';
  end if;
  select * into c from public.order_pickup_codes where order_id = o.id for update;
  if not found then raise exception 'Order has no pickup code'; end if;
  if c.failed_attempts >= 5 then raise exception 'Too many wrong codes; ask the customer to contact support'; end if;
  if c.code <> trim(coalesce(p_code, '')) then
    update public.order_pickup_codes set failed_attempts = failed_attempts + 1 where order_id = o.id;
    return 'wrong_code';
  end if;
  update public.orders set status = 'collected', collected_at = now(), updated_at = now() where id = o.id;
  insert into public.order_events (order_id, status, actor_id, note) values (o.id, 'collected', v_uid, 'Collected at pharmacy');
  return 'collected';
end $$;

-- Admin marks which products need a prescription / an original stamped prescription.
create or replace function public.admin_set_product_rx(p_product_id bigint, p_requires_rx boolean, p_restricted boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  update public.products
     set requires_rx = p_requires_rx or p_restricted, restricted = p_restricted
   where id = p_product_id;
  if not found then raise exception 'Product not found'; end if;
end $$;

revoke execute on function public.confirm_original_rx, public.admin_set_product_rx from public, anon;
grant execute on function public.confirm_original_rx, public.admin_set_product_rx to authenticated;
