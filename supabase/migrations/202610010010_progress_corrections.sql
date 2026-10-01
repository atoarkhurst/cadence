begin;
-- Original daily entries remain untouched. Corrections are an append-only
-- signed ledger; totals combine original entries and these adjustments.
create table if not exists public.progress_adjustments (
 operation_id uuid primary key,
 intention_id uuid not null references public.intentions(id) on delete cascade,
 user_id uuid not null references public.profiles(id),
 value integer not null,
 expected_total integer not null,
 resulting_total integer not null check(resulting_total between 0 and 1000000),
 recorded_on date not null,
 created_at timestamptz not null default now()
);
create index if not exists progress_adjustments_intention_idx on public.progress_adjustments(intention_id);
alter table public.progress_adjustments enable row level security;
drop policy if exists "members read corrections" on public.progress_adjustments;
create policy "members read corrections" on public.progress_adjustments for select to authenticated
using(exists(select 1 from public.intentions i join public.weeks w on w.id=i.week_id where i.id=intention_id and public.is_partnership_member(w.partnership_id)));
revoke all on public.progress_adjustments from public, anon, authenticated;
grant select on public.progress_adjustments to authenticated;
grant all on public.progress_adjustments to service_role;

create or replace function public.set_intention_progress(target_intention uuid, desired_total integer, expected_total integer, operation uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare item public.intentions; prior public.progress_adjustments; total bigint; zone text; space uuid;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 -- Same lock order as schedule/disconnect operations.
 select w.partnership_id into space from public.intentions i join public.weeks w on w.id=i.week_id where i.id=target_intention;
 perform 1 from public.partnerships where id=space for update;
 select * into item from public.intentions where id=target_intention for update;
 if item.id is null or item.owner_id<>auth.uid() or not exists(select 1 from public.weeks w where w.id=item.week_id and public.is_partnership_member(w.partnership_id)) then
  raise exception 'You can only update your own current connection’s goals.';
 end if;
 if operation is null or desired_total is null or expected_total is null or desired_total not between 0 and 1000000 or expected_total<0 then
  raise exception 'Choose valid progress between 0 and 1,000,000.';
 end if;
 if item.kind='one_time' and desired_total not in (0,1) then raise exception 'A one-time intention is complete or incomplete.'; end if;
 select * into prior from public.progress_adjustments where operation_id=operation;
 if found then
  if prior.user_id<>auth.uid() or prior.intention_id<>target_intention or prior.resulting_total<>desired_total or prior.expected_total<>expected_total then
   raise exception 'This save identifier was already used.';
  end if;
  return prior.resulting_total;
 end if;
 select coalesce((select sum(value) from public.progress_entries where intention_id=item.id),0)
      + coalesce((select sum(value) from public.progress_adjustments where intention_id=item.id),0) into total;
 if total<>expected_total then raise exception 'Progress changed on another device. Refresh and try again.'; end if;
 select s.timezone into zone from public.weeks w join public.week_schedules s on s.partnership_id=w.partnership_id where w.id=item.week_id;
 insert into public.progress_adjustments(operation_id,intention_id,user_id,value,expected_total,resulting_total,recorded_on)
 values(operation,item.id,auth.uid(),desired_total-total,expected_total,desired_total,(now() at time zone coalesce(zone,'UTC'))::date);
 return desired_total;
end;
$$;
revoke all on function public.set_intention_progress(uuid,integer,integer,uuid) from public, anon;
grant execute on function public.set_intention_progress(uuid,integer,integer,uuid) to authenticated;
-- Old tabs must refresh instead of bypassing the atomic progress writer.
revoke insert, update, delete on public.progress_entries from public, anon, authenticated;
commit;
