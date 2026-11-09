-- Tests for migration 0009 (three fulfilment options). DEV project only.
-- Runs in one transaction and always ends with RAISE EXCEPTION 'TEST RESULTS ...', so nothing is saved.
do $$
declare
  ph1 uuid; ph2 uuid;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); st uuid := gen_random_uuid(); dr uuid := gen_random_uuid();
  addr uuid; o_pick uuid; o_norm uuid; o_urg uuid; v_code text; n int; r text;
  res text[] := '{}';
begin
  select id into ph1 from public.pharmacies where license_number = 'DEMO-1';
  select id into ph2 from public.pharmacies where license_number = 'DEMO-2';
  insert into auth.users (id, email, phone, aud, role) values
    (a, 'a@test.invalid', '96890000001', 'authenticated', 'authenticated'),
    (b, 'b@test.invalid', '96890000002', 'authenticated', 'authenticated'),
    (st, 's@test.invalid', '96890000003', 'authenticated', 'authenticated'),
    (dr, 'd@test.invalid', '96890000004', 'authenticated', 'authenticated');
  update public.profiles set role = 'pharmacy_staff' where id = st;
  update public.profiles set role = 'driver' where id = dr;
  insert into public.pharmacy_staff (pharmacy_id, user_id) values (ph1, st);
  insert into public.pharmacy_drivers (pharmacy_id, driver_id) values (ph1, dr);
  insert into public.addresses (user_id, label, details) values (a, 'Home', 'Test address, Muscat') returning id into addr;

  -- ===== customer A =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  o_pick := public.place_pickup_order(ph1, '[{"product_id":1,"quantity":2}]');
  o_norm := public.place_order(ph1, addr, '[{"product_id":2,"quantity":1}]');
  o_urg  := public.place_order(ph1, addr, '[{"product_id":3,"quantity":1}]', true);
  select count(*) into n from public.order_pickup_codes where order_id = o_pick;
  res := array_append(res, (('01 customer sees own pickup code: ' || (n = 1)))::text);
  begin
    perform public.admin_set_delivery_enabled(false);
    res := array_append(res, ('02 customer blocked from delivery switch: false')::text);
  exception when others then res := array_append(res, '02 customer blocked from delivery switch: true'::text); end;
  begin
    update public.platform_settings set delivery_enabled = false;
    get diagnostics n = row_count;
    res := array_append(res, (('03 customer cannot edit settings directly: ' || (n = 0)))::text);
  exception when others then res := array_append(res, '03 customer cannot edit settings directly: true'::text); end;
  begin
    perform public.place_order(ph1, null, '[{"product_id":1,"quantity":1}]');
    res := array_append(res, ('04 delivery without address refused: false')::text);
  exception when others then res := array_append(res, '04 delivery without address refused: true'::text); end;
  reset role;

  select fulfilment || '/' || payment_method || '/' || delivery_fee_omr into r from public.orders where id = o_pick;
  res := array_append(res, (('05 pickup = pickup/pay_at_pharmacy/0.000: ' || (r = 'pickup/pay_at_pharmacy/0.000') || ' (' || r || ')'))::text);
  select fulfilment || '/' || payment_method || '/' || delivery_fee_omr into r from public.orders where id = o_norm;
  res := array_append(res, (('06 normal = delivery/cash_on_delivery/0.500: ' || (r = 'delivery/cash_on_delivery/0.500') || ' (' || r || ')'))::text);
  select fulfilment || '/' || delivery_fee_omr || '/' || total_omr into r from public.orders where id = o_urg;
  res := array_append(res, (('07 urgent = urgent_delivery/1.500/3.700: ' || (r = 'urgent_delivery/1.500/3.700') || ' (' || r || ')'))::text);
  select quantity into n from public.pharmacy_stock where pharmacy_id = ph1 and product_id = 1;
  res := array_append(res, (('08 stock reserved for pickup (48): ' || (n = 48)))::text);
  select code into v_code from public.order_pickup_codes where order_id = o_pick;

  -- ===== customer B =====
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.order_pickup_codes;
  res := array_append(res, (('09 other customer sees 0 pickup codes: ' || (n = 0)))::text);
  reset role;

  -- ===== pharmacy staff =====
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.order_pickup_codes;
  res := array_append(res, (('10 pharmacy cannot read pickup codes: ' || (n = 0)))::text);
  perform public.set_order_status(o_pick, 'accepted');
  perform public.set_order_status(o_pick, 'preparing');
  begin
    perform public.set_order_status(o_pick, 'out_for_delivery');
    res := array_append(res, ('11 pickup order cannot go out for delivery: false')::text);
  exception when others then res := array_append(res, '11 pickup order cannot go out for delivery: true'::text); end;
  perform public.set_order_status(o_pick, 'ready_for_pickup');
  r := public.collect_order(o_pick, '000000x');
  res := array_append(res, (('12 wrong code returns wrong_code: ' || (r = 'wrong_code')))::text);
  r := public.collect_order(o_pick, v_code);
  res := array_append(res, (('13 right code collects: ' || (r = 'collected')))::text);
  begin
    perform public.set_order_status(o_norm, 'ready_for_pickup');
    res := array_append(res, ('14 delivery order cannot be ready_for_pickup: false')::text);
  exception when others then res := array_append(res, '14 delivery order cannot be ready_for_pickup: true'::text); end;
  perform public.set_order_status(o_urg, 'accepted');
  perform public.set_order_status(o_urg, 'preparing');
  perform public.assign_driver(o_urg, dr);
  perform public.set_order_status(o_urg, 'out_for_delivery');
  begin
    perform public.set_order_status(o_urg, 'delivered');
    res := array_append(res, ('15 staff cannot mark delivered: false')::text);
  exception when others then res := array_append(res, '15 staff cannot mark delivered: true'::text); end;
  reset role;
  select failed_attempts into n from public.order_pickup_codes where order_id = o_pick;
  res := array_append(res, (('16 wrong try was counted (1): ' || (n = 1)))::text);

  -- ===== driver =====
  perform set_config('request.jwt.claims', json_build_object('sub', dr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_order_status(o_urg, 'delivered');
  reset role;
  select status::text into r from public.orders where id = o_urg;
  res := array_append(res, (('17 driver delivers urgent order: ' || (r = 'delivered')))::text);

  -- ===== switches and pharmacies without urgent fee =====
  update public.pharmacies set urgent_delivery_fee_omr = null where id = ph2;
  update public.platform_settings set delivery_enabled = true;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.place_order(ph2, addr, '[{"product_id":1,"quantity":1}]', true);
    res := array_append(res, ('18 urgent refused when pharmacy has no urgent fee: false')::text);
  exception when others then res := array_append(res, '18 urgent refused when pharmacy has no urgent fee: true'::text); end;
  reset role;
  update public.platform_settings set delivery_enabled = false;
  set local role authenticated;
  begin
    perform public.place_order(ph1, addr, '[{"product_id":1,"quantity":1}]');
    res := array_append(res, ('19 delivery refused when paused: false')::text);
  exception when others then res := array_append(res, '19 delivery refused when paused: true'::text); end;
  begin
    perform public.place_pickup_order(ph1, '[{"product_id":1,"quantity":1}]');
    res := array_append(res, ('20 pickup still works when delivery paused: true')::text);
  exception when others then res := array_append(res, ('20 pickup still works when delivery paused: false ' || sqlerrm)::text); end;
  reset role;

  -- ===== anonymous visitor =====
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.place_pickup_order(ph1, '[{"product_id":1,"quantity":1}]');
    res := array_append(res, ('21 anonymous cannot order: false')::text);
  exception when others then res := array_append(res, '21 anonymous cannot order: true'::text); end;
  select count(*) into n from public.platform_settings;
  res := array_append(res, (('22 anonymous can read delivery switch: ' || (n = 1)))::text);
  reset role;

  raise exception 'TEST RESULTS %', array_to_string(res, E'\n');
end $$;
