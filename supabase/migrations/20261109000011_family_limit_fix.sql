-- 0011 · The 12-member limit inside the family_members policy referred to the same table and caused
-- "infinite recursion detected in policy". Move the limit into a trigger.
alter policy "owner manages family" on public.family_members
  using (owner_id = auth.uid() and private.is_registered())
  with check (owner_id = auth.uid() and private.is_registered());

create or replace function private.limit_family_members()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.family_members where owner_id = new.owner_id) >= 12 then
    raise exception 'A family record can hold up to 12 people';
  end if;
  return new;
end $$;
revoke execute on function private.limit_family_members from public, anon, authenticated;

create trigger family_members_limit before insert on public.family_members
  for each row execute function private.limit_family_members();
