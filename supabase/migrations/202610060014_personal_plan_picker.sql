begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A signup workspace is useful before someone connects, but an unused one
-- should not look like a second relationship after a connection is made.
-- This is a read-only presentation filter: no workspace or history is deleted.
create or replace function public.list_partnerships_for_picker()
returns table(id uuid, partner_name text, partner_id uuid, pending_email text)
language sql stable security definer set search_path = '' as $$
 with mine as (
  select p.id
  from public.partnership_members m
  join public.partnerships p on p.id=m.partnership_id and p.disconnected_at is null
  where m.user_id=auth.uid()
 ), choices as (
  select mine.id, profile.display_name as partner_name, other.user_id as partner_id,
   (select i.email from public.invitations i where i.partnership_id=mine.id
    and i.invited_by=auth.uid() and i.accepted_at is null and i.expires_at>now()
    order by i.created_at desc limit 1) as pending_email
  from mine
  left join public.partnership_members other on other.partnership_id=mine.id
   and other.user_id<>auth.uid()
  left join public.profiles profile on profile.id=other.user_id
 )
 select c.id,c.partner_name,c.partner_id,c.pending_email
 from choices c
 where c.partner_id is not null or c.pending_email is not null
  or not exists(select 1 from choices connected where connected.partner_id is not null)
  or exists (
   select 1 from public.weeks w where w.partnership_id=c.id and (
    nullif(trim(coalesce(w.reflection,'')),'') is not null
    or exists(select 1 from public.intentions i where i.week_id=w.id)
    or exists(select 1 from public.daily_check_ins d where d.week_id=w.id)
    or exists(select 1 from public.encouragements e where e.week_id=w.id)
    or exists(select 1 from public.weekly_reviews r where r.week_id=w.id)
   )
  )
  or exists(select 1 from public.week_schedule_changes s where s.partnership_id=c.id)
 order by (c.partner_id is not null) desc,c.id;
$$;
revoke all on function public.list_partnerships_for_picker() from public,anon;
grant execute on function public.list_partnerships_for_picker() to authenticated;

commit;
