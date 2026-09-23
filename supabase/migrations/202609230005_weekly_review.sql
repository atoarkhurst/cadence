begin;
create table if not exists public.weekly_reviews (
  week_id uuid not null references public.weeks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  went_well text not null default '' check (char_length(went_well) <= 1000),
  got_in_way text not null default '' check (char_length(got_in_way) <= 1000),
  submitted_at timestamptz not null default now(),
  primary key (week_id, user_id)
);
alter table public.weekly_reviews enable row level security;
drop policy if exists "partners read weekly reviews" on public.weekly_reviews;
create policy "partners read weekly reviews" on public.weekly_reviews for select to authenticated
using (exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id)));
grant select on public.weekly_reviews to authenticated;

-- One transaction saves the reflection and creates the selected next-week goals.
-- The review key makes retries harmless, including a lost network response.
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

  insert into public.weeks(partnership_id, starts_on)
    values (source.partnership_id, source.starts_on + 7)
    on conflict (partnership_id, starts_on) do nothing;
  select id into destination from public.weeks where partnership_id = source.partnership_id and starts_on = source.starts_on + 7;
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
