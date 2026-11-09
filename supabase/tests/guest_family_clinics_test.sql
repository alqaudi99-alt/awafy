-- Tests for migration 0010 (guest ordering, family health record, clinics). DEV project only.
-- Rolled back: always ends with RAISE EXCEPTION 'TEST RESULTS ...'.
do $$
declare
  ph1 uuid; g uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  o uuid; kid uuid; n int; r text; j jsonb; res text[] := '{}';
begin
  select id into ph1 from public.pharmacies where license_number = 'DEMO-1';
  insert into auth.users (id, aud, role, is_anonymous) values (g, 'authenticated', 'authenticated', true);
  insert into auth.users (id, email, phone, aud, role) values
    (a, 'fa@test.invalid', '96890000011', 'authenticated', 'authenticated'),
    (b, 'fb@test.invalid', '96890000012', 'authenticated', 'authenticated');
  -- test-only clinical setup: approve paracetamol syrup record, link to product 1 (120 mg / 5 ml)
  update public.dosage_reference set review_status = 'approved', min_age_months = 3, max_age_months = 144 where id = 2;
  update public.products set strength_mg = 120, strength_per = 5, dose_unit = 'ml' where id = 1;
  insert into public.product_dosage values (1, 2);

  -- ===== guest (anonymous sign-in) =====
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  set local role authenticated;
  begin
    perform public.place_pickup_order(ph1, '[{"product_id":1,"quantity":1}]');
    res := array_append(res, '01 guest without phone refused: false');
  exception when others then res := array_append(res, '01 guest without phone refused: true'); end;
  update public.profiles set full_name = 'ضيف تجريبي', contact_phone = '+96891234567' where id = g;
  o := public.place_pickup_order(ph1, '[{"product_id":1,"quantity":1}]');
  select is_guest::text || '/' || contact_phone into r from public.orders where id = o;
  res := array_append(res, ('02 guest order saved with contact: ' || (r = 'true/+96891234567') || ' (' || r || ')')::text);
  select count(*) into n from public.order_pickup_codes where order_id = o;
  res := array_append(res, ('03 guest sees own pickup code: ' || (n = 1))::text);
  perform public.place_pickup_order(ph1, '[{"product_id":2,"quantity":1}]');
  begin
    perform public.place_pickup_order(ph1, '[{"product_id":3,"quantity":1}]');
    res := array_append(res, '04 guest limited to 2 open orders: false');
  exception when others then res := array_append(res, '04 guest limited to 2 open orders: true'); end;
  begin
    insert into public.family_members (name) values ('x');
    res := array_append(res, '05 guest cannot create family record: false');
  exception when others then res := array_append(res, '05 guest cannot create family record: true'); end;
  begin
    update public.profiles set contact_phone = '12345' where id = g;
    res := array_append(res, '06 invalid phone rejected: false');
  exception when others then res := array_append(res, '06 invalid phone rejected: true'); end;
  reset role;

  -- ===== registered customer A: family record and dose =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
  insert into public.family_members (name, relation, sex, birth_date) values ('سارة', 'child', 'female', current_date - interval '24 months')
    returning id into kid;
  j := public.member_dose(kid, 1);
  res := array_append(res, ('07 no weight -> asks for weight: ' || (j ->> 'status' = 'no_weight') || ' (' || (j ->> 'status') || ')')::text);
  insert into public.member_measurements (member_id, measured_on, weight_kg) values (kid, current_date - 100, 11);
  j := public.member_dose(kid, 1);
  res := array_append(res, ('08 100-day-old weight flagged stale: ' || ((j ->> 'weight_stale')::boolean))::text);
  insert into public.member_measurements (member_id, measured_on, weight_kg, length_cm) values (kid, current_date, 12, 86);
  j := public.member_dose(kid, 1);
  res := array_append(res, ('09 dose from latest weight 12 kg = 120-180 mg, 5-7.5 ml, fresh: '
      || (j ->> 'status' = 'ok' and (j ->> 'dose_mg_low')::numeric = 120 and (j ->> 'dose_mg_high')::numeric = 180
          and (j ->> 'amount_low')::numeric = 5 and (j ->> 'amount_high')::numeric = 7.5 and not (j ->> 'weight_stale')::boolean)
      || ' ' || j::text)::text);
  j := public.member_dose(kid, 5);
  res := array_append(res, ('10 product without dosage link -> no_rule: ' || (j ->> 'status' = 'no_rule'))::text);
  insert into public.member_medications (member_id, product_id, name, dose_text) values (kid, 1, 'باراسيتامول شراب', '5 مل');
  o := public.place_pickup_order(ph1, '[{"product_id":1,"quantity":1}]');
  perform public.set_order_member(o, kid);
  select count(*) into n from public.orders where id = o and family_member_id = kid;
  res := array_append(res, ('11 order linked to family member: ' || (n = 1))::text);
  begin
    perform public.register_clinic('عيادة اختبار', 'telemedicine', 'TEST-CL-1', '+96890000099');
    res := array_append(res, '12 registered user can apply as clinic: true');
  exception when others then res := array_append(res, ('12 registered user can apply as clinic: false ' || sqlerrm)::text); end;
  begin
    perform public.admin_set_clinic_verified((select id from public.clinics where license_number = 'TEST-CL-1'), true);
    res := array_append(res, '13 customer cannot verify clinic: false');
  exception when others then res := array_append(res, '13 customer cannot verify clinic: true'); end;
  reset role;

  -- ===== registered customer B =====
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
  select count(*) into n from public.family_members;
  res := array_append(res, ('14 other customer sees 0 family members: ' || (n = 0))::text);
  select count(*) into n from public.member_measurements;
  res := array_append(res, ('15 other customer sees 0 measurements: ' || (n = 0))::text);
  select count(*) into n from public.member_medications;
  res := array_append(res, ('16 other customer sees 0 medicine records: ' || (n = 0))::text);
  begin
    perform public.member_dose(kid, 1);
    res := array_append(res, '17 other customer cannot get dose for A child: false');
  exception when others then res := array_append(res, '17 other customer cannot get dose for A child: true'); end;
  begin
    insert into public.member_measurements (member_id, weight_kg) values (kid, 50);
    res := array_append(res, '18 other customer cannot add weight to A child: false');
  exception when others then res := array_append(res, '18 other customer cannot add weight to A child: true'); end;
  reset role;

  -- ===== guest cannot read family data, register clinic =====
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  set local role authenticated;
  begin
    perform public.register_clinic('عيادة ضيف', 'telemedicine', 'TEST-CL-2', '+96890000098');
    res := array_append(res, '19 guest cannot apply as clinic: false');
  exception when others then res := array_append(res, '19 guest cannot apply as clinic: true'); end;
  reset role;

  -- ===== anonymous visitor (no sign-in at all) =====
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from public.clinics;
  res := array_append(res, ('20 visitor sees verified clinics only (1 demo): ' || (n = 1) || ' (' || n || ')')::text);
  begin
    select count(*) into n from public.family_members;
    res := array_append(res, ('21 visitor blocked from family data: ' || (n = 0))::text);
  exception when others then res := array_append(res, '21 visitor blocked from family data: true'); end;
  reset role;

  raise exception 'TEST RESULTS %', array_to_string(res, E'\n');
end $$;
