begin;
create schema if not exists cadence_private;
revoke all on schema cadence_private from public,anon,authenticated;
create table if not exists cadence_private.creation_events (
 user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null,
 created_at timestamptz not null default now()
);
revoke all on cadence_private.creation_events from public,anon,authenticated;
create index if not exists creation_events_user_idx on cadence_private.creation_events(user_id,kind,created_at);
-- No UI uses direct invitation updates or message edits. Keep identity,
-- acceptance, expiration, and timestamps server-managed.
revoke insert, update on public.invitations from public, anon, authenticated;
grant insert(partnership_id,email,invited_by) on public.invitations to authenticated;
revoke insert, update on public.encouragements from public, anon, authenticated;
grant insert(week_id,author_id,message) on public.encouragements to authenticated;

create or replace function public.limit_social_creation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then return new; end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 -- Retain quota usage independently of deleting one's own message/invitation.
 delete from cadence_private.creation_events where user_id=auth.uid() and created_at<now()-interval '1 day';
 if tg_table_name='invitations' then
  new.email := lower(trim(new.email));
  if length(new.email)>254 or new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
  if (select count(*) from cadence_private.creation_events where user_id=auth.uid() and kind=tg_table_name and created_at>now()-interval '1 hour') >= 10 then
   raise exception 'You have created several invitations. Please try again in an hour.';
  end if;
 else
  if (select count(*) from cadence_private.creation_events where user_id=auth.uid() and kind=tg_table_name and created_at>now()-interval '1 minute') >= 12
   or (select count(*) from cadence_private.creation_events where user_id=auth.uid() and kind=tg_table_name and created_at>now()-interval '1 day') >= 200 then
   raise exception 'You have sent several notes. Please take a moment before sending another.';
  end if;
 end if;
 new.created_at := now();
 insert into cadence_private.creation_events(user_id,kind) values(auth.uid(),tg_table_name);
 return new;
end;
$$;
revoke all on function public.limit_social_creation() from public, anon, authenticated;
drop trigger if exists limit_invitation_creation on public.invitations;
create trigger limit_invitation_creation before insert on public.invitations for each row execute function public.limit_social_creation();
drop trigger if exists limit_encouragement_creation on public.encouragements;
create trigger limit_encouragement_creation before insert on public.encouragements for each row execute function public.limit_social_creation();
create index if not exists invitations_sender_created_idx on public.invitations(invited_by,created_at);
create index if not exists encouragements_sender_created_idx on public.encouragements(author_id,created_at);
commit;
