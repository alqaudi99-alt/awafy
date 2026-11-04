-- Bug found by the 4 Nov access test: PL/pgSQL resolves NEW.is_verified even when the table is
-- promotions, so any promotion insert/update by staff failed. Check the table name first, in its own IF.
create or replace function public.protect_admin_flags()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.is_admin() then
    return new;
  end if;
  if tg_table_name = 'pharmacies' then
    if new.is_verified is distinct from old.is_verified then
      raise exception 'Only an administrator can verify a pharmacy';
    end if;
  elsif tg_table_name = 'promotions' then
    if new.is_approved and (tg_op = 'INSERT' or not old.is_approved) then
      raise exception 'Only an administrator can approve a promotion';
    end if;
    if tg_op = 'UPDATE' and old.is_approved
       and (new.text_ar, new.text_en, new.starts_at, new.ends_at, new.pharmacy_id)
           is distinct from (old.text_ar, old.text_en, old.starts_at, old.ends_at, old.pharmacy_id) then
      new.is_approved := false;
    end if;
  end if;
  return new;
end $$;
