begin;
alter table public.weeks add column if not exists next_week_id uuid references public.weeks(id);
alter table public.weeks add column if not exists original_starts_on date;
create table if not exists public.week_schedules (
 partnership_id uuid primary key references public.partnerships(id),
 start_day integer not null check(start_day between 0 and 6),
 previous_day integer not null default 1,
 effective_on date not null,
 timezone text not null,
 updated_by uuid not null references public.profiles(id)
);
create table if not exists public.week_schedule_changes (
 id uuid primary key default gen_random_uuid(),
 partnership_id uuid not null references public.partnerships(id),
 changed_by uuid not null references public.profiles(id),
 changed_at timestamptz not null default now(),
 before_schedule jsonb,
 week_dates jsonb not null
);
alter table public.week_schedules enable row level security;
alter table public.week_schedule_changes enable row level security;
drop policy if exists "members read schedule" on public.week_schedules;
create policy "members read schedule" on public.week_schedules for select to authenticated using(public.is_partnership_member(partnership_id));
drop policy if exists "members read schedule changes" on public.week_schedule_changes;
create policy "members read schedule changes" on public.week_schedule_changes for select to authenticated using(public.is_partnership_member(partnership_id));
grant select on public.week_schedules,public.week_schedule_changes to authenticated;
update public.weeks w set next_week_id=n.id from public.weeks n
 where w.next_week_id is null and n.partnership_id=w.partnership_id and n.starts_on=w.starts_on+7
 and exists(select 1 from public.weekly_reviews r where r.week_id=w.id);

create or replace function public.change_week_schedule(target_partnership uuid, new_day integer, shared_timezone text)
returns date language plpgsql security definer set search_path=''
as $$
declare
 old_schedule public.week_schedules;
 today date;
 old_day integer;
 old_start date;
 new_start date;
 shift integer;
 source public.weeks;
 item record;
 destination uuid;
begin
 perform 1 from public.partnerships where id=target_partnership for update;
 if auth.uid() is null or not public.is_partnership_member(target_partnership) then raise exception 'You must belong to this partnership.'; end if;
 if new_day is null or new_day not between 0 and 6 then raise exception 'Choose a valid day.'; end if;
 if not exists(select 1 from pg_timezone_names where name=shared_timezone) then raise exception 'Choose a valid time zone.'; end if;
 select * into old_schedule from public.week_schedules where partnership_id=target_partnership;
 if found and old_schedule.start_day=new_day then return old_schedule.effective_on; end if;
 today := (now() at time zone coalesce(old_schedule.timezone,shared_timezone))::date;
 if old_schedule.effective_on > today then raise exception 'Your schedule change is already planned. Wait until it begins before changing it again.'; end if;
 old_day := coalesce(old_schedule.start_day,1);
 old_start := today - ((extract(dow from today)::integer-old_day+7)%7);
 if new_day=old_day then return old_start; end if;
 -- Use the selected day within this cycle, even if the meeting was yesterday.
 new_start := old_start + ((new_day-old_day+7)%7);
 select * into source from public.weeks where partnership_id=target_partnership and starts_on=old_start for update;
 if source.id is null then raise exception 'Open This week before changing the schedule.'; end if;
 if exists(select 1 from public.partnership_members m where m.partnership_id=target_partnership and not exists(select 1 from public.weekly_reviews r where r.week_id=source.id and r.user_id=m.user_id)) then
   raise exception 'Both partners should save their current weekly review before changing the schedule.';
 end if;
 perform 1 from public.weeks where partnership_id=target_partnership order by starts_on for update;
 if exists(select 1 from public.weeks w join public.weekly_reviews r on r.week_id=w.id where w.partnership_id=target_partnership and w.starts_on>old_start) then
   raise exception 'A future plan already has a saved review. Its dates have been kept unchanged.';
 end if;
 shift := new_start-(old_start+7);
 insert into public.week_schedule_changes(partnership_id,changed_by,before_schedule,week_dates)
 select target_partnership,auth.uid(),to_jsonb(old_schedule),coalesce(jsonb_agg(jsonb_build_object('id',id,'starts_on',starts_on,'next_week_id',next_week_id)),'[]'::jsonb)
 from public.weeks where partnership_id=target_partnership;
 -- Move dates only; IDs, goals, progress, notes, and completed reviews stay intact.
 for item in select id,starts_on from public.weeks where partnership_id=target_partnership and starts_on>old_start
 order by case when shift>0 then - (starts_on-date '2000-01-01') else starts_on-date '2000-01-01' end
 loop
   update public.weeks set original_starts_on=coalesce(original_starts_on,starts_on),starts_on=starts_on+shift where id=item.id;
 end loop;
 insert into public.week_schedules(partnership_id,start_day,previous_day,effective_on,timezone,updated_by)
 values(target_partnership,new_day,old_day,new_start,coalesce(old_schedule.timezone,shared_timezone),auth.uid())
 on conflict(partnership_id) do update set start_day=excluded.start_day,previous_day=excluded.previous_day,effective_on=excluded.effective_on,updated_by=excluded.updated_by;
 insert into public.weeks(partnership_id,starts_on) values(target_partnership,new_start) on conflict(partnership_id,starts_on) do nothing;
 select id into destination from public.weeks where partnership_id=target_partnership and starts_on=new_start;
 update public.weeks set next_week_id=destination where id=source.id;
 return new_start;
end;
$$;
revoke all on function public.change_week_schedule(uuid,integer,text) from public,anon;
grant execute on function public.change_week_schedule(uuid,integer,text) to authenticated;
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


-- Older open tabs cannot create another Monday plan after the schedule changes.
create or replace function public.check_week_schedule()
returns trigger language plpgsql security definer set search_path=''
as $$
declare settings public.week_schedules;
begin
 perform 1 from public.partnerships where id=new.partnership_id for update;
 select * into settings from public.week_schedules where partnership_id=new.partnership_id;
 if found and new.starts_on>=settings.effective_on and extract(dow from new.starts_on)::integer<>settings.start_day then
   raise exception 'Your shared week schedule changed. Refresh Cadence to open the current plan.';
 end if;
 return new;
end;
$$;
drop trigger if exists check_week_schedule on public.weeks;
create trigger check_week_schedule before insert on public.weeks for each row execute function public.check_week_schedule();

-- Preserve each account’s cycle when the existing disconnect flow creates solo spaces.
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
    insert into public.week_schedules(partnership_id,start_day,previous_day,effective_on,timezone,updated_by)
      select destination,start_day,previous_day,effective_on,timezone,auth.uid()
      from public.week_schedules where partnership_id=target_partnership
      on conflict(partnership_id) do update set start_day=excluded.start_day,previous_day=excluded.previous_day,effective_on=excluded.effective_on,timezone=excluded.timezone;
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

commit;
