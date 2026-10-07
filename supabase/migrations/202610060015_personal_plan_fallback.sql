begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Keep every connected, pending, or used plan. Offer one empty starter only
-- when nothing else is available. Existing rows and access policies are unchanged.
create or replace function public.list_partnerships_for_picker()
returns table(id uuid, partner_name text, partner_id uuid, pending_email text)
language sql stable security definer set search_path = '' as $$
 with choices as (
  select c.*,
   exists (
    select 1 from public.weeks w where w.partnership_id=c.id and (
     nullif(trim(coalesce(w.reflection,'')),'') is not null
     or exists(select 1 from public.intentions i where i.week_id=w.id)
     or exists(select 1 from public.daily_check_ins d where d.week_id=w.id)
     or exists(select 1 from public.encouragements e where e.week_id=w.id)
     or exists(select 1 from public.weekly_reviews r where r.week_id=w.id)
    )
   ) or exists (
    select 1 from public.week_schedule_changes s where s.partnership_id=c.id
   ) as has_activity
  from public.list_partnerships() c
 ), useful as (
  select c.* from choices c
  where c.partner_id is not null or c.pending_email is not null or c.has_activity
 )
 select c.id,c.partner_name,c.partner_id,c.pending_email
 from choices c
 where exists(select 1 from useful u where u.id=c.id)
  or (not exists(select 1 from useful)
      and c.id=(select starter.id from choices starter order by starter.id limit 1))
 order by (c.partner_id is not null) desc,(c.pending_email is not null) desc,c.id;
$$;
revoke all on function public.list_partnerships_for_picker() from public,anon;
grant execute on function public.list_partnerships_for_picker() to authenticated;

-- Keep the first page and the picker on the same default plan.
create or replace function public.ensure_workspace()
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 if not found then raise exception 'Your profile is not ready.'; end if;
 select c.id into result from public.list_partnerships_for_picker() c
 order by (c.partner_id is not null) desc,(c.pending_email is not null) desc,c.id limit 1;
 if result is null then
  insert into public.partnerships(created_by) values(auth.uid()) returning id into result;
  insert into public.partnership_members(partnership_id,user_id) values(result,auth.uid());
 end if;
 return result;
end;
$$;
revoke all on function public.ensure_workspace() from public,anon;
grant execute on function public.ensure_workspace() to authenticated;
notify pgrst, 'reload schema';
commit;
