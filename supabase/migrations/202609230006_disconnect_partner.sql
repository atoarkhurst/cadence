begin;
alter table public.partnerships add column if not exists disconnected_at timestamptz;

-- Closed spaces retain shared records, but cannot be rejoined.
create or replace function public.reject_closed_partnership()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.partnerships where id = new.partnership_id and disconnected_at is null for update;
  if not found then raise exception 'This connection has ended. Ask for a new invitation.'; end if;
  return new;
end;
$$;
drop trigger if exists reject_closed_membership on public.partnership_members;
create trigger reject_closed_membership before insert on public.partnership_members
for each row execute function public.reject_closed_partnership();

create or replace function public.disconnect_partner(target_partnership uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  people uuid[];
  spaces uuid[];
  person uuid;
  destination uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  perform 1 from public.partnerships where id = target_partnership for update;
  if not public.is_partnership_member(target_partnership) then
    raise exception 'You are not a member of this connection.';
  end if;
  select array_agg(user_id order by user_id) into people
    from public.partnership_members where partnership_id = target_partnership;
  if cardinality(people) <> 2 then raise exception 'There is no partner to disconnect.'; end if;
  -- Include duplicate reciprocal connections between these same two accounts.
  select array_agg(p.id order by p.id) into spaces from public.partnerships p
    where (select array_agg(m.user_id order by m.user_id)
      from public.partnership_members m where m.partnership_id = p.id) = people;
  perform 1 from public.partnerships where id = any(spaces) order by id for update;
  foreach person in array people loop
    destination := null;
    select m.partnership_id into destination from public.partnership_members m
      join public.partnerships p on p.id = m.partnership_id
      where m.user_id = person and p.disconnected_at is null
      and (select count(*) from public.partnership_members n where n.partnership_id = m.partnership_id) = 1
      order by m.partnership_id limit 1;
    if destination is null then
      insert into public.partnerships(created_by) values(person) returning id into destination;
      insert into public.partnership_members(partnership_id,user_id) values(destination,person);
    end if;
    insert into public.weeks(partnership_id,starts_on)
      select distinct destination,w.starts_on from public.weeks w
      join public.intentions i on i.week_id = w.id
      where w.partnership_id = any(spaces) and i.owner_id = person
      on conflict(partnership_id,starts_on) do nothing;
    update public.intentions i set week_id = dest.id
      from public.weeks source, public.weeks dest
      where i.week_id = source.id and i.owner_id = person
      and source.partnership_id = any(spaces)
      and dest.partnership_id = destination and dest.starts_on = source.starts_on;
  end loop;
  update public.partnerships set disconnected_at = now() where id = any(spaces);
  update public.invitations set expires_at = least(expires_at, now()) where partnership_id = any(spaces);
  delete from public.partnership_members where partnership_id = any(spaces);
end;
$$;
revoke all on function public.disconnect_partner(uuid) from public, anon;
grant execute on function public.disconnect_partner(uuid) to authenticated;
-- A known old record ID must not let a former member write into another space.
alter policy "members manage progress" on public.progress_entries
with check (user_id = auth.uid() and exists (
  select 1 from public.intentions i join public.weeks w on w.id = i.week_id
  where i.id = intention_id and i.owner_id = auth.uid() and public.is_partnership_member(w.partnership_id)
));
alter policy "members manage encouragements" on public.encouragements
with check (author_id = auth.uid() and exists (
  select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id)
));
alter policy "members manage check-ins" on public.daily_check_ins
with check (user_id = auth.uid() and exists (
  select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id)
));
commit;
