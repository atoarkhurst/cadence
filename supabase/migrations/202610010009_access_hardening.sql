begin;

-- Keep shared reads separate from owner-only writes. WITH CHECK does not
-- protect DELETE or establish ownership of the old row during UPDATE.
drop policy if exists "members manage intentions" on public.intentions;
drop policy if exists "members read intentions" on public.intentions;
create policy "members read intentions" on public.intentions for select to authenticated
using (exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id)));
drop policy if exists "owners manage intentions" on public.intentions;
create policy "owners manage intentions" on public.intentions for all to authenticated
using (owner_id = auth.uid() and exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id)))
with check (owner_id = auth.uid() and exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id)));

drop policy if exists "members manage progress" on public.progress_entries;
drop policy if exists "members read progress" on public.progress_entries;
create policy "members read progress" on public.progress_entries for select to authenticated
using (exists (select 1 from public.intentions i join public.weeks w on w.id = i.week_id where i.id = intention_id and public.is_partnership_member(w.partnership_id)));
drop policy if exists "owners manage progress" on public.progress_entries;
create policy "owners manage progress" on public.progress_entries for all to authenticated
using (user_id = auth.uid() and exists (select 1 from public.intentions i join public.weeks w on w.id = i.week_id where i.id = intention_id and i.owner_id = auth.uid() and public.is_partnership_member(w.partnership_id)))
with check (user_id = auth.uid() and exists (select 1 from public.intentions i join public.weeks w on w.id = i.week_id where i.id = intention_id and i.owner_id = auth.uid() and public.is_partnership_member(w.partnership_id)));

drop policy if exists "members manage encouragements" on public.encouragements;
drop policy if exists "members read encouragements" on public.encouragements;
create policy "members read encouragements" on public.encouragements for select to authenticated
using (exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id)));
drop policy if exists "authors manage encouragements" on public.encouragements;
create policy "authors manage encouragements" on public.encouragements for all to authenticated
using (author_id = auth.uid() and exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id)))
with check (author_id = auth.uid() and exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id)));

drop policy if exists "members manage check-ins" on public.daily_check_ins;
drop policy if exists "members read check-ins" on public.daily_check_ins;
create policy "members read check-ins" on public.daily_check_ins for select to authenticated
using (exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id)));
drop policy if exists "owners manage check-ins" on public.daily_check_ins;
create policy "owners manage check-ins" on public.daily_check_ins for all to authenticated
using (user_id = auth.uid() and exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id)))
with check (user_id = auth.uid() and exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id)));

-- Only server functions can change week links/dates or delete shared history.
revoke update, delete, truncate, references, trigger on public.weeks from public, anon, authenticated;
revoke insert on public.weeks from public, anon, authenticated;
grant insert (partnership_id, starts_on) on public.weeks to authenticated;

-- The composite foreign key protects privileged functions too. Abort safely if
-- unexpected existing data violates the invariant; never silently repair history.
do $$ begin
 if not exists (select 1 from pg_constraint where conrelid = 'public.weeks'::regclass and conname = 'weeks_id_partnership_unique') then
  alter table public.weeks add constraint weeks_id_partnership_unique unique(id, partnership_id);
 end if;
 if not exists (select 1 from pg_constraint where conrelid = 'public.weeks'::regclass and conname = 'weeks_next_same_partnership') then
  alter table public.weeks add constraint weeks_next_same_partnership foreign key(next_week_id, partnership_id) references public.weeks(id, partnership_id);
 end if;
end $$;

create or replace function public.can_read_profile(target_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and (target_user = auth.uid() or exists (
  select 1 from public.partnership_members mine join public.partnership_members theirs using(partnership_id)
  where mine.user_id = auth.uid() and theirs.user_id = target_user
 ));
$$;
revoke all on function public.can_read_profile(uuid) from public, anon;
grant execute on function public.can_read_profile(uuid) to authenticated;
drop policy if exists "profiles are visible to signed-in users" on public.profiles;
drop policy if exists "own and partner profiles" on public.profiles;
create policy "own and partner profiles" on public.profiles for select to authenticated using(public.can_read_profile(id));

-- Invitees may see the sender's name, not browse unrelated profile records.
create or replace function public.pending_invitations()
returns table(token uuid, invited_by uuid, name text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select i.token, i.invited_by, p.display_name, i.expires_at
 from public.invitations i join public.profiles p on p.id = i.invited_by
 join public.partnerships s on s.id = i.partnership_id
 where auth.uid() is not null and lower(i.email) = lower(auth.jwt()->>'email')
 and i.accepted_at is null and i.expires_at > now() and s.disconnected_at is null;
$$;
revoke all on function public.pending_invitations() from public, anon;
grant execute on function public.pending_invitations() to authenticated;

-- Serializing on the profile makes first use safe across tabs/components.
create or replace function public.ensure_workspace()
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 perform 1 from public.profiles where id = auth.uid() for update;
 if not found then raise exception 'Your profile is not ready.'; end if;
 select m.partnership_id into result from public.partnership_members m
 join public.partnerships p on p.id=m.partnership_id
 where m.user_id=auth.uid() and p.disconnected_at is null
 order by exists(select 1 from public.partnership_members other where other.partnership_id=m.partnership_id and other.user_id<>auth.uid()) desc, m.partnership_id
 limit 1;
 if result is null then
  insert into public.partnerships(created_by) values(auth.uid()) returning id into result;
  insert into public.partnership_members(partnership_id,user_id) values(result,auth.uid());
 end if;
 return result;
end;
$$;
revoke all on function public.ensure_workspace() from public, anon;
grant execute on function public.ensure_workspace() to authenticated;
create or replace function public.wrap_up_week(
  source_week uuid, wins text, obstacles text,
  carry_ids uuid[] default '{}', new_intentions jsonb default '[]'
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  source public.weeks;
  destination uuid;
  entry jsonb;
  intention_kind text;
  intention_target integer;
begin
  perform 1 from public.partnerships where id=(select partnership_id from public.weeks where id=source_week) for update;
  select * into source from public.weeks where id = source_week for update;
  if auth.uid() is null or source.id is null or not public.is_partnership_member(source.partnership_id) then
    raise exception 'You must belong to this partnership to review its week.';
  end if;
  if char_length(coalesce(wins, '')) > 1000 or char_length(coalesce(obstacles, '')) > 1000 then
    raise exception 'Keep each reflection under 1,000 characters.';
  end if;
  if jsonb_typeof(new_intentions) is distinct from 'array' then
    raise exception 'New intentions must be a list.';
  end if;
  if jsonb_array_length(new_intentions) > 4 or cardinality(carry_ids) > 100 then
    raise exception 'Keep your next week achievable.';
  end if;
  if exists (
    select 1 from unnest(carry_ids) selected(id)
    where not exists (select 1 from public.intentions i where i.id = selected.id and i.week_id = source_week and i.owner_id = auth.uid())
  ) then raise exception 'You can only carry your own intentions into next week.'; end if;

  destination := source.next_week_id;
  if destination is not null and not exists (
    select 1 from public.weeks where id=destination and partnership_id=source.partnership_id
  ) then raise exception 'The next week must belong to the same partnership.'; end if;
  if destination is null then
    insert into public.weeks(partnership_id,starts_on) values(source.partnership_id,source.starts_on+7)
      on conflict(partnership_id,starts_on) do nothing;
    select id into destination from public.weeks where partnership_id=source.partnership_id and starts_on=source.starts_on+7;
    update public.weeks set next_week_id=destination where id=source.id;
  end if;
  if exists (select 1 from public.weekly_reviews where week_id = source_week and user_id = auth.uid()) then
    return destination;
  end if;
  insert into public.weekly_reviews(week_id, user_id, went_well, got_in_way)
    values (source_week, auth.uid(), coalesce(wins, ''), coalesce(obstacles, ''));
  insert into public.intentions(week_id, owner_id, title, kind, target, sort_order)
    select destination, auth.uid(), title, kind, target, sort_order
    from public.intentions where id = any(carry_ids) and week_id = source_week and owner_id = auth.uid();
  for entry in select value from jsonb_array_elements(new_intentions) loop
    intention_kind := coalesce(entry ->> 'kind', 'one_time');
    if intention_kind not in ('one_time', 'count') or char_length(trim(coalesce(entry ->> 'name', ''))) not between 1 and 160 then
      raise exception 'Give each intention a name of 1–160 characters.';
    end if;
    intention_target := case when intention_kind = 'count' then (entry ->> 'target')::integer else null end;
    if intention_kind = 'count' and (intention_target is null or intention_target < 1) then
      raise exception 'A repeatable intention needs a positive target.';
    end if;
    insert into public.intentions(week_id, owner_id, title, kind, target)
      values (destination, auth.uid(), trim(entry ->> 'name'), intention_kind, intention_target);
  end loop;
  return destination;
end;
$$;
revoke all on function public.wrap_up_week(uuid,text,text,uuid[],jsonb) from public, anon;
grant execute on function public.wrap_up_week(uuid,text,text,uuid[],jsonb) to authenticated;
commit;
