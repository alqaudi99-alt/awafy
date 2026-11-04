-- Phase 1: customers order in the app and collect from the pharmacy, paying at the counter.
-- Home delivery stays built but is switched off until the delivery permission is granted (Phase 2).

-- Platform switches (one row). Only admins change it.
create table public.platform_settings (
  id boolean primary key default true check (id),
  delivery_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (true);
alter table public.platform_settings enable row level security;
create policy "settings are readable" on public.platform_settings for select to anon, authenticated using (true);

-- Orders: fulfilment type, address optional for pickup, pay at pharmacy.
alter table public.orders
  add column fulfilment text not null default 'pickup' check (fulfilment in ('pickup', 'delivery')),
  alter column delivery_address drop not null,
  alter column payment_method set default 'pay_at_pharmacy';
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('pay_at_pharmacy', 'cash_on_delivery'));
alter table public.orders add constraint orders_delivery_needs_address
  check (fulfilment = 'pickup' or delivery_address is not null);
alter table public.orders add column collected_at timestamptz;

-- Pickup code: shown only to the customer; the pharmacy checks it at the counter but cannot read it.
create table public.order_pickup_codes (
  order_id uuid primary key references public.orders (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'),
  failed_attempts int not null default 0
);
alter table public.order_pickup_codes enable row level security;
create policy "customer sees own pickup code" on public.order_pickup_codes for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
revoke all on public.order_pickup_codes from anon;
revoke insert, update, delete on public.order_pickup_codes from authenticated;

-- Shared order creation: validates, reserves stock, writes order, items, history.
create or replace function private.create_order(
  p_uid uuid, p_pharmacy_id uuid, p_fulfilment text, p_address_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid; v_fee numeric(10, 3); v_address text; v_subtotal numeric(10, 3); v_rx boolean;
  v_lines int; v_reserved int; v_status public.order_status;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Cart must contain between 1 and 50 items';
  end if;
  if (select count(*) from public.orders where customer_id = p_uid
        and status in ('awaiting_prescription', 'placed', 'accepted', 'preparing', 'ready_for_pickup')) >= 5 then
    raise exception 'You have too many open orders; please wait for one to complete';
  end if;
  select delivery_fee_omr into v_fee from public.pharmacies where id = p_pharmacy_id and is_verified and is_active;
  if not found then raise exception 'Pharmacy is not available'; end if;

  if p_fulfilment = 'delivery' then
    if not (select delivery_enabled from public.platform_settings) then
      raise exception 'Home delivery is not available yet; please choose pickup';
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
                             subtotal_omr, delivery_fee_omr, total_omr, requires_rx)
  values (p_uid, p_pharmacy_id, p_address_id, v_address, v_status, p_fulfilment,
          case when p_fulfilment = 'pickup' then 'pay_at_pharmacy' else 'cash_on_delivery' end,
          v_subtotal, v_fee, v_subtotal + v_fee, v_rx)
  returning id into v_order;

  insert into public.order_items (order_id, product_id, product_name, quantity, unit_price_omr)
  select v_order, p.id, p.name_ar, l.qty, s.price_omr
    from (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty
            from jsonb_array_elements(p_items) e group by 1) l
    join public.products p on p.id = l.product_id
    join public.pharmacy_stock s on s.product_id = p.id and s.pharmacy_id = p_pharmacy_id;

  if p_fulfilment = 'pickup' then
    insert into public.order_pickup_codes (order_id, code)
    values (v_order, lpad((floor(random() * 1000000))::int::text, 6, '0'));
  end if;
  insert into public.order_events (order_id, status, actor_id) values (v_order, v_status, p_uid);
  return v_order;
end $$;
revoke execute on function private.create_order from public, anon, authenticated;

-- Phase 1 entry point.
create or replace function public.place_pickup_order(p_pharmacy_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  return private.create_order(auth.uid(), p_pharmacy_id, 'pickup', null, p_items);
end $$;

-- Phase 2 entry point (kept; refuses while delivery is switched off).
create or replace function public.place_order(p_pharmacy_id uuid, p_address_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  return private.create_order(auth.uid(), p_pharmacy_id, 'delivery', p_address_id, p_items);
end $$;

-- Status flow. Pickup: placed → accepted → preparing → ready_for_pickup → collected (via collect_order).
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
             or (o.fulfilment = 'delivery' and o.status = 'preparing' and p_status = 'out_for_delivery')
             or p_status = 'cancelled';

  if o.customer_id = v_uid and not is_admin then
    allowed := p_status = 'cancelled' and o.status in ('awaiting_prescription', 'placed');
  elsif is_admin or private.is_staff_of(o.pharmacy_id) then
    allowed := staff_step or (is_admin and o.fulfilment = 'delivery' and o.status = 'out_for_delivery' and p_status = 'delivered');
  elsif o.driver_id = v_uid then
    allowed := o.fulfilment = 'delivery' and o.status = 'out_for_delivery' and p_status = 'delivered';
  end if;
  if not allowed then raise exception 'This status change is not allowed'; end if;

  if p_status in ('accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered') and o.requires_rx
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

-- Hand-over at the counter: the customer shows their 6-digit code; 5 wrong tries lock the order.
create or replace function public.collect_order(p_order_id uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); o public.orders%rowtype; c public.order_pickup_codes%rowtype;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not (private.is_staff_of(o.pharmacy_id) or private.is_admin()) then raise exception 'Not allowed'; end if;
  if o.status <> 'ready_for_pickup' then raise exception 'Order is not ready for pickup'; end if;
  if o.requires_rx and not exists (select 1 from public.prescriptions where order_id = o.id and status = 'approved') then
    raise exception 'An approved prescription is required before hand-over';
  end if;
  select * into c from public.order_pickup_codes where order_id = o.id for update;
  if not found then raise exception 'Order has no pickup code'; end if;
  if c.failed_attempts >= 5 then raise exception 'Too many wrong codes; ask the customer to contact support'; end if;
  if c.code <> trim(coalesce(p_code, '')) then
    update public.order_pickup_codes set failed_attempts = failed_attempts + 1 where order_id = o.id;
    raise exception 'Wrong pickup code';
  end if;
  update public.orders set status = 'collected', collected_at = now(), updated_at = now() where id = o.id;
  insert into public.order_events (order_id, status, actor_id, note) values (o.id, 'collected', v_uid, 'Collected at pharmacy');
end $$;

-- Admin switch for Phase 2.
create or replace function public.admin_set_delivery_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  update public.platform_settings set delivery_enabled = p_enabled, updated_at = now();
end $$;

revoke execute on function public.place_pickup_order, public.collect_order, public.admin_set_delivery_enabled from public, anon;
grant execute on function public.place_pickup_order, public.collect_order, public.admin_set_delivery_enabled to authenticated;
