-- Stock is reserved when an order is placed and returned if it is cancelled (review #9).
-- Drivers belong to pharmacies; only linked drivers can be assigned (review #10).

create table public.pharmacy_drivers (
  pharmacy_id uuid not null references public.pharmacies (id) on delete cascade,
  driver_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pharmacy_id, driver_id)
);
create index pharmacy_drivers_driver_idx on public.pharmacy_drivers (driver_id);
alter table public.pharmacy_drivers enable row level security;

create policy "staff, driver and admin see driver links" on public.pharmacy_drivers for select to authenticated
  using (driver_id = auth.uid() or private.is_staff_of(pharmacy_id) or private.is_admin());

-- Pharmacy staff can read the name/phone of drivers linked to their pharmacy (to assign them).
create policy "staff see their drivers" on public.profiles for select to authenticated
  using (exists (select 1 from public.pharmacy_drivers pd
                 where pd.driver_id = profiles.id and private.is_staff_of(pd.pharmacy_id)));

-- Admin links a registered user (by phone) to a pharmacy as a driver.
create or replace function public.admin_link_driver(p_pharmacy_id uuid, p_phone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_role public.app_role; v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if not private.is_admin() then raise exception 'Not allowed'; end if;
  if v_phone !~ '^968' then v_phone := '968' || v_phone; end if;
  select id, role into v_user, v_role from public.profiles where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone;
  if not found then raise exception 'No registered user with this phone; the driver must log in to the app once first'; end if;
  if v_role not in ('customer', 'driver') then raise exception 'This account already has another role'; end if;
  perform set_config('awafy.role_change', 'on', true);
  update public.profiles set role = 'driver' where id = v_user;
  perform set_config('awafy.role_change', 'off', true);
  insert into public.pharmacy_drivers (pharmacy_id, driver_id) values (p_pharmacy_id, v_user) on conflict do nothing;
  return v_user;
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
  if not exists (select 1 from public.pharmacy_drivers pd join public.profiles p on p.id = pd.driver_id
                  where pd.pharmacy_id = v_pharmacy and pd.driver_id = p_driver_id and p.role = 'driver') then
    raise exception 'This driver is not linked to your pharmacy';
  end if;
  update public.orders set driver_id = p_driver_id, updated_at = now() where id = p_order_id;
  insert into public.order_events (order_id, status, actor_id, note) values (p_order_id, v_status, auth.uid(), 'Driver assigned');
end $$;

-- place_order: lock stock rows, then reserve (decrement) them atomically.
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
  v_reserved int;
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

  if exists (select 1 from (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty
                              from jsonb_array_elements(p_items) e group by 1) x
              where qty is null or qty < 1 or qty > 99 or product_id is null) then
    raise exception 'Invalid quantity';
  end if;
  select count(*) into v_lines
    from (select (e ->> 'product_id')::bigint from jsonb_array_elements(p_items) e group by 1) x;

  -- Reserve stock: each line updates only if enough is left; rows are locked by the UPDATE.
  with l as (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty
               from jsonb_array_elements(p_items) e group by 1),
       upd as (update public.pharmacy_stock s
                  set quantity = s.quantity - l.qty, updated_at = now()
                 from l, public.products p
                where s.pharmacy_id = p_pharmacy_id and s.product_id = l.product_id
                  and p.id = l.product_id and p.is_active and s.quantity >= l.qty
                returning s.product_id)
  select count(*) into v_reserved from upd;
  if v_reserved <> v_lines then
    raise exception 'Some items are not available in this quantity';  -- whole transaction rolls back
  end if;

  select coalesce(sum(l.qty * s.price_omr), 0), coalesce(bool_or(p.requires_rx), false)
    into v_subtotal, v_rx
    from (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty
            from jsonb_array_elements(p_items) e group by 1) l
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
    from (select (e ->> 'product_id')::bigint as product_id, sum((e ->> 'quantity')::int) as qty
            from jsonb_array_elements(p_items) e group by 1) l
    join public.products p on p.id = l.product_id
    join public.pharmacy_stock s on s.product_id = p.id and s.pharmacy_id = p_pharmacy_id;

  insert into public.order_events (order_id, status, actor_id)
  values (v_order, case when v_rx then 'awaiting_prescription'::public.order_status else 'placed' end, v_uid);
  return v_order;
end $$;

-- Return reserved stock when an order is cancelled.
create or replace function public.restore_stock_on_cancel()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.pharmacy_stock s
       set quantity = s.quantity + i.quantity, updated_at = now()
      from public.order_items i
     where i.order_id = new.id and s.product_id = i.product_id and s.pharmacy_id = new.pharmacy_id;
  end if;
  return new;
end $$;
create trigger orders_restore_stock after update of status on public.orders
  for each row execute function public.restore_stock_on_cancel();

revoke execute on function public.admin_link_driver from public, anon;
grant execute on function public.admin_link_driver to authenticated;
revoke execute on function public.restore_stock_on_cancel from public, anon, authenticated;
