begin;
create table if not exists public.encouragement_reactions (
  encouragement_id uuid not null references public.encouragements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (encouragement_id, user_id)
);
alter table public.encouragement_reactions enable row level security;
revoke all on public.encouragement_reactions from public, anon, authenticated;
grant select on public.encouragement_reactions to authenticated;
drop policy if exists "partners read hearts" on public.encouragement_reactions;
create policy "partners read hearts" on public.encouragement_reactions
for select to authenticated using (
  exists (select 1 from public.encouragements e
    join public.weeks w on w.id=e.week_id
    join public.partnerships p on p.id=w.partnership_id
    where e.id=encouragement_id and p.disconnected_at is null
      and public.is_partnership_member(p.id))
);
-- Explicit desired state makes retries safe; this does not create notifications.
create or replace function public.set_encouragement_heart(note_id uuid, hearted boolean)
returns void language plpgsql security definer set search_path='' as $$
declare pair_id uuid; author uuid;
begin
  if auth.uid() is null or hearted is null then
    raise exception 'Sign in to acknowledge a note.';
  end if;
  select w.partnership_id, e.author_id into pair_id, author
    from public.encouragements e join public.weeks w on w.id=e.week_id
    where e.id=note_id;
  -- Serialize with disconnect so a former partner cannot write after unlinking.
  perform 1 from public.partnerships where id=pair_id and disconnected_at is null for update;
  if not found or author=auth.uid() or not public.is_partnership_member(pair_id)
    or not exists(select 1 from public.partnership_members where partnership_id=pair_id and user_id=author) then
    raise exception 'Only the current recipient can acknowledge this note.';
  end if;
  if hearted then
    insert into public.encouragement_reactions(encouragement_id,user_id)
      values(note_id,auth.uid()) on conflict do nothing;
  else
    delete from public.encouragement_reactions where encouragement_id=note_id and user_id=auth.uid();
  end if;
end $$;
revoke all on function public.set_encouragement_heart(uuid,boolean) from public,anon;
grant execute on function public.set_encouragement_heart(uuid,boolean) to authenticated;
commit;
