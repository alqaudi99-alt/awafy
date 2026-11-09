-- Tests for migration 0012 (original stamped prescription, pickup only). DEV only; rolled back.
do $$
declare
  ph1 uuid; a uuid := gen_random_uuid(); st uuid := gen_random_uuid();
  addr uuid; o uuid; o2 uuid; v_code text; n int; r text; res text[] := '{}';
begin
  select id into ph1 from public.pharmacies where license_number = 'DEMO-1';
  insert into auth.users (id, email, phone, aud, role) values
    (a, 'ra@test.invalid', '96890000021', 'authenticated', 'authenticated'),
    (st, 'rs@test.invalid', '96890000022', 'authenticated', 'authenticated');
  update public.profiles set role = 'pharmacy_staff' where id = st;
  insert into public.pharmacy_staff (pharmacy_id, user_id) values (ph1, st);
  insert into public.addresses (user_id, label, details) values (a, 'Home', 'Test address, Muscat') returning id into addr;
  update public.products set requires_rx = true, restricted = true where id = 6;   -- test-only flag
  insert into public.pharmacy_stock (pharmacy_id, product_id, price_omr, quantity)
    values (ph1, 6, 3.5, 20) on conflict (pharmacy_id, product_id) do update set quantity = 20;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.place_order(ph1, addr, '[{"product_id":6,"quantity":1}]');
    res := array_append(res, '01 restricted medicine refused for delivery: false');
  exception when others then res := array_append(res, '01 restricted medicine refused for delivery: true'); end;
  begin
    perform public.place_order(ph1, addr, '[{"product_id":6,"quantity":1}]', true);
    res := array_append(res, '02 restricted medicine refused for urgent delivery: false');
  exception when others then res := array_append(res, '02 restricted medicine refused for urgent delivery: true'); end;
  o := public.place_pickup_order(ph1, '[{"product_id":6,"quantity":1},{"product_id":1,"quantity":1}]');
  select status::text || '/' || has_restricted into r from public.orders where id = o;
  res := array_append(res, ('03 pickup order accepted, ready to prepare (placed/true): ' || (r = 'placed/true') || ' (' || r || ')')::text);
  select code into v_code from public.order_pickup_codes where order_id = o;
  begin
    perform public.confirm_original_rx(o);
    res := array_append(res, '04 customer cannot confirm own prescription: false');
  exception when others then res := array_append(res, '04 customer cannot confirm own prescription: true'); end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_order_status(o, 'accepted');
  perform public.set_order_status(o, 'preparing');
  perform public.set_order_status(o, 'ready_for_pickup');
  res := array_append(res, '05 pharmacy prepares without an uploaded copy: true');
  begin
    perform public.collect_order(o, v_code);
    res := array_append(res, '06 hand-over blocked until original checked: false');
  exception when others then res := array_append(res, '06 hand-over blocked until original checked: true'); end;
  perform public.confirm_original_rx(o);
  r := public.collect_order(o, v_code);
  res := array_append(res, ('07 after original checked, code hands over: ' || (r = 'collected'))::text);
  reset role;
  select count(*) into n from public.order_events where order_id = o and note = 'Original stamped prescription received and checked';
  res := array_append(res, ('08 check recorded in order history: ' || (n = 1))::text);

  -- ordinary prescription medicine still needs an uploaded, approved prescription
  update public.products set restricted = false where id = 6;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  o2 := public.place_pickup_order(ph1, '[{"product_id":6,"quantity":1}]');
  reset role;
  select status::text into r from public.orders where id = o2;
  res := array_append(res, ('09 ordinary Rx order waits for prescription: ' || (r = 'awaiting_prescription'))::text);
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.confirm_original_rx(o2);
    res := array_append(res, '10 original-check refused on ordinary order: false');
  exception when others then res := array_append(res, '10 original-check refused on ordinary order: true'); end;
  begin
    perform public.admin_set_product_rx(1, true, true);
    res := array_append(res, '11 pharmacy staff cannot change product flags: false');
  exception when others then res := array_append(res, '11 pharmacy staff cannot change product flags: true'); end;
  reset role;

  raise exception 'TEST RESULTS %', array_to_string(res, E'\n');
end $$;
