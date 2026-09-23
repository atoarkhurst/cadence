create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.partnerships (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our cadence',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.partnership_members (
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (partnership_id, user_id)
);

create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  starts_on date not null,
  reflection text,
  created_at timestamptz not null default now(),
  unique (partnership_id, starts_on)
);

create table public.intentions (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  kind text not null check (kind in ('one_time', 'count')),
  target integer check (target is null or target > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  intention_id uuid not null references public.intentions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  value integer not null default 0 check (value >= 0),
  recorded_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (intention_id, user_id, recorded_on)
);

create table public.daily_check_ins (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mood smallint check (mood between 1 and 5),
  reflection text check (char_length(reflection) <= 1000),
  checked_in_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (week_id, user_id, checked_in_on)
);

create table public.encouragements (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 280),
  created_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  email text not null,
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references public.profiles(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_partnership_member(target_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.partnership_members
    where partnership_id = target_id and user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.partnerships enable row level security;
alter table public.partnership_members enable row level security;
alter table public.weeks enable row level security;
alter table public.intentions enable row level security;
alter table public.progress_entries enable row level security;
alter table public.daily_check_ins enable row level security;
alter table public.encouragements enable row level security;
alter table public.invitations enable row level security;

create policy "profiles are visible to signed-in users" on public.profiles for select to authenticated using (true);
create policy "users update their profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "users create partnerships" on public.partnerships for insert to authenticated with check (created_by = auth.uid());
create policy "members view partnerships" on public.partnerships for select to authenticated using (public.is_partnership_member(id) or created_by = auth.uid());
create policy "members view membership" on public.partnership_members for select to authenticated using (public.is_partnership_member(partnership_id) or user_id = auth.uid());
create policy "creators add members" on public.partnership_members for insert to authenticated with check (user_id = auth.uid() or exists (select 1 from public.partnerships p where p.id = partnership_id and p.created_by = auth.uid()));
create policy "members manage weeks" on public.weeks for all to authenticated using (public.is_partnership_member(partnership_id)) with check (public.is_partnership_member(partnership_id));
create policy "members manage intentions" on public.intentions for all to authenticated using (exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id))) with check (owner_id = auth.uid() and exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id)));
create policy "members manage progress" on public.progress_entries for all to authenticated using (exists (select 1 from public.intentions i join public.weeks w on w.id = i.week_id where i.id = intention_id and public.is_partnership_member(w.partnership_id))) with check (user_id = auth.uid());
create policy "members manage check-ins" on public.daily_check_ins for all to authenticated using (exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id))) with check (user_id = auth.uid());
create policy "members manage encouragements" on public.encouragements for all to authenticated using (exists (select 1 from public.weeks w where w.id = week_id and public.is_partnership_member(w.partnership_id))) with check (author_id = auth.uid());
create policy "creators manage invitations" on public.invitations for all to authenticated using (invited_by = auth.uid()) with check (invited_by = auth.uid() and public.is_partnership_member(partnership_id));

create index weeks_partnership_idx on public.weeks(partnership_id, starts_on desc);
create index intentions_week_idx on public.intentions(week_id, sort_order);
create index progress_intention_idx on public.progress_entries(intention_id, recorded_on desc);
create index encouragements_week_idx on public.encouragements(week_id, created_at desc);
