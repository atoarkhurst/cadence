create table public.daily_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.daily_completions (
  item_id uuid not null references public.daily_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  completed_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id, completed_on)
);

alter table public.daily_items enable row level security;
alter table public.daily_completions enable row level security;

create policy "users manage their daily items" on public.daily_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage their completions" on public.daily_completions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index daily_items_user_idx on public.daily_items(user_id, sort_order);
create index daily_completions_date_idx on public.daily_completions(user_id, completed_on);
