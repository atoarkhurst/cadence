create or replace function public.accept_invitation(invitation_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.invitations;
begin
  select * into invitation
  from public.invitations
  where token = invitation_token
    and accepted_at is null
    and expires_at > now()
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));

  if invitation.id is null then
    raise exception 'This invitation is invalid, expired, or belongs to another email address.';
  end if;

  insert into public.partnership_members (partnership_id, user_id)
  values (invitation.partnership_id, auth.uid())
  on conflict do nothing;

  update public.invitations set accepted_at = now() where id = invitation.id;
  return invitation.partnership_id;
end;
$$;

grant execute on function public.accept_invitation(uuid) to authenticated;
