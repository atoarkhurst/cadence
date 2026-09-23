-- Allow the invited account to see its invitations inside Cadence.
drop policy if exists "recipients view invitations" on public.invitations;
create policy "recipients view invitations" on public.invitations
for select to authenticated
using (lower(email) = lower(auth.jwt() ->> 'email'));

create or replace function public.accept_invitation(invitation_token uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  invitation public.invitations;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into invitation from public.invitations
    where token = invitation_token
      and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    for update;
  if invitation.id is null then
    raise exception 'Use the email address this invitation was created for.';
  end if;
  -- Serialize invitations to the same partnership.
  perform 1 from public.partnerships where id = invitation.partnership_id for update;
  if not exists (select 1 from public.partnership_members
    where partnership_id = invitation.partnership_id and user_id = auth.uid()) then
  if invitation.accepted_at is not null or invitation.expires_at <= now() then
    raise exception 'This invitation has expired or was already used.';
  end if;
  if (select count(*) from public.partnership_members where partnership_id = invitation.partnership_id) >= 2 then
    raise exception 'This partnership already has two people.';
  end if;
  insert into public.partnership_members(partnership_id, user_id)
    values (invitation.partnership_id, auth.uid());
  update public.invitations set accepted_at = now() where id = invitation.id;
  end if;
  -- Carry this user's intentions from their solo weeks into the shared weeks.
  -- Records and progress IDs are preserved.
  insert into public.weeks(partnership_id, starts_on)
    select distinct invitation.partnership_id, w.starts_on
    from public.weeks w join public.intentions i on i.week_id = w.id
    where i.owner_id = auth.uid() and w.partnership_id <> invitation.partnership_id
      and exists (select 1 from public.partnership_members m where m.partnership_id = w.partnership_id and m.user_id = auth.uid())
      and (select count(*) from public.partnership_members m where m.partnership_id = w.partnership_id) = 1
    on conflict (partnership_id, starts_on) do nothing;
  update public.intentions i set week_id = destination.id
    from public.weeks source, public.weeks destination
    where i.week_id = source.id and i.owner_id = auth.uid()
      and destination.partnership_id = invitation.partnership_id
      and destination.starts_on = source.starts_on
      and source.partnership_id <> invitation.partnership_id
      and exists (select 1 from public.partnership_members m where m.partnership_id = source.partnership_id and m.user_id = auth.uid())
      and (select count(*) from public.partnership_members m where m.partnership_id = source.partnership_id) = 1;
  return invitation.partnership_id;
end;
$$;
revoke all on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- Joining requires an invitation. A creator may establish their own membership.
drop policy if exists "creators add members" on public.partnership_members;
create policy "creators add members" on public.partnership_members
for insert to authenticated with check (
  user_id = auth.uid() and exists (
    select 1 from public.partnerships p where p.id = partnership_id and p.created_by = auth.uid()
  )
);

-- Repair intentions left in solo workspaces by previously accepted invitations.
do $$
declare
  member record;
begin
  for member in
    select distinct on (m.user_id) m.user_id, m.partnership_id
    from public.partnership_members m
    where exists (select 1 from public.partnership_members p where p.partnership_id = m.partnership_id and p.user_id <> m.user_id)
    order by m.user_id, m.partnership_id
  loop
    insert into public.weeks(partnership_id, starts_on)
      select distinct member.partnership_id, w.starts_on
      from public.weeks w join public.intentions i on i.week_id = w.id
      where i.owner_id = member.user_id and w.partnership_id <> member.partnership_id
        and exists (select 1 from public.partnership_members m where m.partnership_id = w.partnership_id and m.user_id = member.user_id)
        and (select count(*) from public.partnership_members m where m.partnership_id = w.partnership_id) = 1
      on conflict (partnership_id, starts_on) do nothing;
    update public.intentions i set week_id = destination.id
      from public.weeks source, public.weeks destination
      where i.week_id = source.id and i.owner_id = member.user_id
        and destination.partnership_id = member.partnership_id
        and destination.starts_on = source.starts_on
        and source.partnership_id <> member.partnership_id
        and exists (select 1 from public.partnership_members m where m.partnership_id = source.partnership_id and m.user_id = member.user_id)
        and (select count(*) from public.partnership_members m where m.partnership_id = source.partnership_id) = 1;
  end loop;
end;
$$;
