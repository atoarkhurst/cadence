begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Stop rather than silently choosing between historical connections for a pair.
do $$
begin
 if exists (
  select 1 from (
   select min(m.user_id::text) first_id, max(m.user_id::text) second_id
   from public.partnership_members m
   join public.partnerships p on p.id=m.partnership_id
   where p.disconnected_at is null
   group by m.partnership_id
   having count(*)=2
  ) pairs
  group by first_id,second_id having count(*)>1
 ) then
  raise exception 'Duplicate active partner pairs exist. Resolve them manually before deploying multiple connections.';
 end if;
end;
$$;

create or replace function public.create_partner_invitation(recipient_email text, target_partnership uuid default null)
returns public.invitations language plpgsql security definer set search_path = '' as $$
declare result public.invitations; destination uuid; recipient uuid; normalized text;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 normalized := lower(trim(recipient_email));
 if normalized is null or length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
  raise exception 'Enter a valid email address.';
 end if;
 if normalized=lower(auth.jwt()->>'email') then raise exception 'Enter your partner’s email, rather than your own.'; end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select id into recipient from auth.users where lower(email)=normalized limit 1;
 if exists(select 1 from public.partnership_members mine join public.partnership_members other using(partnership_id)
   where mine.user_id=auth.uid() and other.user_id=recipient) then
  raise exception 'You already have a partnership with this person.';
 end if;
 destination := target_partnership;
 if destination is not null then
  perform 1 from public.partnerships where id=destination and disconnected_at is null for update;
  if not found or not public.is_partnership_member(destination) then raise exception 'This partnership is not available.'; end if;
  if (select count(*) from public.partnership_members where partnership_id=destination)<>1 then
   raise exception 'Each partnership has two people. Add a separate partner instead.';
  end if;
 end if;
 select i.* into result from public.invitations i join public.partnerships p on p.id=i.partnership_id
 where i.invited_by=auth.uid() and i.email=normalized and i.accepted_at is null and i.expires_at>now()
 and p.disconnected_at is null order by i.created_at desc limit 1;
 if result.id is not null then
  if destination is not null and result.partnership_id=destination then return result; end if;
  raise exception 'You already have a pending invitation to this person for another plan. Share or cancel it before creating a new one.';
 end if;
 if destination is not null then
  if exists(select 1 from public.invitations where partnership_id=destination and accepted_at is null and expires_at>now()) then
   raise exception 'This plan already has a pending invitation. Cancel it before inviting someone else.';
  end if;
 else
  if (select count(*) from public.invitations where invited_by=auth.uid() and accepted_at is null and expires_at>now())>=5 then
   raise exception 'You have five pending invitations. Cancel an unused invitation first.';
  end if;
  insert into public.partnerships(created_by) values(auth.uid()) returning id into destination;
  insert into public.partnership_members(partnership_id,user_id) values(destination,auth.uid());
 end if;
 insert into public.invitations(partnership_id,email,invited_by) values(destination,normalized,auth.uid()) returning * into result;
 return result;
end;
$$;
revoke all on function public.create_partner_invitation(text,uuid) from public,anon;
grant execute on function public.create_partner_invitation(text,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
