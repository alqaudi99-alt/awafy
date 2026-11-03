-- Move policy helper functions out of the exposed API schema (Supabase advisor 0028/0029).
-- Policies reference functions by OID, so they keep working after the move.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

alter function public.my_role() set schema private;
alter function public.is_admin() set schema private;
alter function public.is_staff_of(uuid) set schema private;
alter function public.can_see_order(uuid) set schema private;

-- Bodies used fully qualified public.* names; re-point internal calls to private.*
create or replace function private.can_see_order(p_order uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order
      and (o.customer_id = auth.uid() or o.driver_id = auth.uid()
           or private.is_staff_of(o.pharmacy_id) or private.is_admin())
  )
$$;

-- Business functions and triggers call the helpers; recreate them to use private.*
do $$
declare f record; src text;
begin
  for f in
    select p.oid, pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and pg_get_functiondef(p.oid) ~ 'public\.(my_role|is_admin|is_staff_of|can_see_order)\('
  loop
    src := regexp_replace(f.def, 'public\.(my_role|is_admin|is_staff_of|can_see_order)\(', 'private.\1(', 'g');
    execute src;
  end loop;
end $$;
