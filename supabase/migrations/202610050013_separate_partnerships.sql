begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$ begin
 if exists(select 1 from public.partnership_members group by partnership_id having count(*)>2) then
  raise exception 'A partnership has more than two members. Review it before this migration; no data was changed.';
 end if;
end $$;

-- No backfill, relocation, or deletion of existing goals, messages or reviews.
-- Membership and invitations are now exclusively managed by checked functions.
revoke insert, update, delete, truncate, references, trigger on public.partnership_members from public, authenticated, anon;
revoke insert, update, delete, truncate, references, trigger on public.partnerships from public, authenticated, anon;
revoke insert, update, delete, truncate, references, trigger on public.invitations from public, authenticated, anon;
revoke insert(partnership_id,email,invited_by) on public.invitations from public, authenticated, anon;

create or replace function public.list_partnerships()
returns table(id uuid, partner_name text, partner_id uuid, pending_email text)
language sql stable security definer set search_path = '' as $$
 select p.id, profile.display_name, other.user_id,
 (select i.email from public.invitations i where i.partnership_id=p.id and i.invited_by=auth.uid()
  and i.accepted_at is null and i.expires_at>now() order by i.created_at desc limit 1)
 from public.partnership_members mine
 join public.partnerships p on p.id=mine.partnership_id and p.disconnected_at is null
 left join public.partnership_members other on other.partnership_id=p.id and other.user_id<>auth.uid()
 left join public.profiles profile on profile.id=other.user_id
 where mine.user_id=auth.uid()
 order by (other.user_id is not null) desc,p.id;
$$;
revoke all on function public.list_partnerships() from public,anon;
grant execute on function public.list_partnerships() to authenticated;

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
 -- Serialize a sender's create/retry requests; quota trigger uses the same lock.
 perform 1 from public.profiles where id=auth.uid() for update;
 select id into recipient from auth.users where lower(email)=normalized limit 1;
 if exists(select 1 from public.partnership_members mine join public.partnership_members other using(partnership_id)
   where mine.user_id=auth.uid() and other.user_id=recipient) then
  raise exception 'You already have a partnership with this person.';
 end if;
 select i.* into result from public.invitations i join public.partnerships p on p.id=i.partnership_id
 where i.invited_by=auth.uid() and i.email=normalized and i.accepted_at is null and i.expires_at>now()
 and p.disconnected_at is null order by i.created_at desc limit 1;
 if result.id is not null then return result; end if;
 destination := target_partnership;
 if destination is not null then
  perform 1 from public.partnerships where id=destination and disconnected_at is null for update;
  if not found or not public.is_partnership_member(destination) then raise exception 'This partnership is not available.'; end if;
  if (select count(*) from public.partnership_members where partnership_id=destination)<>1 then
   raise exception 'Each partnership has two people. Add a separate partner instead.';
  end if;
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

create or replace function public.cancel_partner_invitation(invitation_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 perform 1 from public.invitations where token=invitation_token and invited_by=auth.uid() and accepted_at is null for update;
 if not found then raise exception 'This invitation is no longer pending.'; end if;
 update public.invitations set expires_at=least(expires_at,now()) where token=invitation_token;
end;
$$;
revoke all on function public.cancel_partner_invitation(uuid) from public,anon;
grant execute on function public.cancel_partner_invitation(uuid) to authenticated;

-- No token-only profile/email lookup: details are disclosed only to the recipient.
create or replace function public.invitation_details(invitation_token uuid)
returns table(name text, expires_at timestamptz, accepted boolean)
language sql stable security definer set search_path = '' as $$
 select p.display_name,i.expires_at,i.accepted_at is not null
 from public.invitations i join public.profiles p on p.id=i.invited_by
 join public.partnerships s on s.id=i.partnership_id and s.disconnected_at is null
 where auth.uid() is not null and i.token=invitation_token and lower(i.email)=lower(auth.jwt()->>'email');
$$;
revoke all on function public.invitation_details(uuid) from public,anon;
grant execute on function public.invitation_details(uuid) to authenticated;

create or replace function public.pending_invitations()
returns table(token uuid, invited_by uuid, name text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select i.token,i.invited_by,p.display_name,i.expires_at
 from public.invitations i join public.profiles p on p.id=i.invited_by
 join public.partnerships s on s.id=i.partnership_id and s.disconnected_at is null
 where auth.uid() is not null and lower(i.email)=lower(auth.jwt()->>'email')
 and i.invited_by<>auth.uid() and i.accepted_at is null and i.expires_at>now()
 and (select count(*) from public.partnership_members m where m.partnership_id=i.partnership_id)=1
 and exists(select 1 from public.partnership_members m where m.partnership_id=i.partnership_id and m.user_id=i.invited_by);
$$;
revoke all on function public.pending_invitations() from public,anon;
grant execute on function public.pending_invitations() to authenticated;

create or replace function public.accept_invitation(invitation_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.invitations; existing uuid;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 -- Read only enough to lock both profiles in a consistent order, preventing
 -- reciprocal invitations from creating duplicate pairs concurrently.
 select * into invitation from public.invitations where token=invitation_token
 and lower(email)=lower(auth.jwt()->>'email');
 if invitation.id is null then raise exception 'Sign in with the email this invitation was sent to.'; end if;
 perform 1 from public.profiles where id in (auth.uid(),invitation.invited_by) order by id for update;
 select * into invitation from public.invitations where token=invitation_token for update;
 perform 1 from public.partnerships where id=invitation.partnership_id and disconnected_at is null for update;
 if not found then raise exception 'This connection has ended. Ask for a new invitation.'; end if;
 if public.is_partnership_member(invitation.partnership_id) and invitation.accepted_at is not null then return invitation.partnership_id; end if;
 if invitation.accepted_at is not null or invitation.expires_at<=now() then raise exception 'This invitation has expired or was cancelled. Ask for a new link.'; end if;
 if invitation.invited_by=auth.uid() then raise exception 'You cannot accept your own invitation.'; end if;
 select mine.partnership_id into existing from public.partnership_members mine
 join public.partnership_members other using(partnership_id)
 where mine.user_id=auth.uid() and other.user_id=invitation.invited_by limit 1;
 if existing is not null then raise exception 'You are already connected. Open your existing partnership.'; end if;
 if (select count(*) from public.partnership_members where partnership_id=invitation.partnership_id)<>1
 or not exists(select 1 from public.partnership_members where partnership_id=invitation.partnership_id and user_id=invitation.invited_by) then
  raise exception 'This partnership is no longer available.';
 end if;
 insert into public.partnership_members(partnership_id,user_id) values(invitation.partnership_id,auth.uid());
 update public.invitations set accepted_at=now() where id=invitation.id;
 update public.invitations set expires_at=least(expires_at,now()) where partnership_id=invitation.partnership_id and accepted_at is null;
 -- Deliberately do not move intentions, progress, schedules or reviews.
 return invitation.partnership_id;
end;
$$;
revoke all on function public.accept_invitation(uuid) from public,anon;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- A disconnection only affects the selected pair. Each user's own goals retain
-- their IDs in a NEW private workspace, never an existing partner's workspace.
create or replace function public.disconnect_partner(target_partnership uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare people uuid[]; person uuid; destination uuid;
begin
 if auth.uid() is null then raise exception 'Please sign in first.'; end if;
 if not public.is_partnership_member(target_partnership) then raise exception 'You are not a member of this connection.'; end if;
 -- Match acceptance's profile-before-partnership ordering to avoid opposing
 -- accept/disconnect operations holding each other's invitation locks.
 perform 1 from public.profiles where id in (
  select user_id from public.partnership_members where partnership_id=target_partnership
 ) order by id for update;
 perform 1 from public.partnerships where id=target_partnership for update;
 if not public.is_partnership_member(target_partnership) then raise exception 'You are not a member of this connection.'; end if;
 select array_agg(user_id) into people from public.partnership_members where partnership_id=target_partnership;
 if cardinality(people)<>2 then raise exception 'There is no partner to disconnect.'; end if;
 foreach person in array people loop
  insert into public.partnerships(created_by) values(person) returning id into destination;
  insert into public.partnership_members(partnership_id,user_id) values(destination,person);
  insert into public.week_schedules(partnership_id,start_day,timezone,effective_on,previous_day,updated_by)
   select destination,start_day,timezone,effective_on,previous_day,person from public.week_schedules where partnership_id=target_partnership;
  insert into public.weeks(partnership_id,starts_on)
   select destination,w.starts_on from public.weeks w where w.partnership_id=target_partnership;
  update public.intentions i set week_id=dest.id from public.weeks source,public.weeks dest
   where i.week_id=source.id and i.owner_id=person and source.partnership_id=target_partnership
   and dest.partnership_id=destination and dest.starts_on=source.starts_on;
 end loop;
 update public.partnerships set disconnected_at=now() where id=target_partnership;
 update public.invitations set expires_at=least(expires_at,now()) where partnership_id=target_partnership;
 delete from public.partnership_members where partnership_id=target_partnership;
end;
$$;
revoke all on function public.disconnect_partner(uuid) from public,anon;
grant execute on function public.disconnect_partner(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
