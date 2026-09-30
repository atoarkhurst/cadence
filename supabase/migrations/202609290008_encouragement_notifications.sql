begin;

-- Additive only: existing encouragement, goals, progress and reviews are untouched.
-- Existing notes do not suddenly become unread or generate retrospective pushes.
create table if not exists public.encouragement_notifications (
  id uuid primary key default gen_random_uuid(),
  encouragement_id uuid not null references public.encouragements(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  week_id uuid not null references public.weeks(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(encouragement_id, recipient_id)
);
create index if not exists encouragement_unread_idx on public.encouragement_notifications(recipient_id, created_at desc) where read_at is null;
alter table public.encouragement_notifications enable row level security;
drop policy if exists "recipients read active encouragement notifications" on public.encouragement_notifications;
create policy "recipients read active encouragement notifications" on public.encouragement_notifications for select to authenticated
using (recipient_id = auth.uid() and public.is_partnership_member(partnership_id) and exists (
  select 1 from public.partnership_members m where m.partnership_id = encouragement_notifications.partnership_id and m.user_id = sender_id
));
revoke all on public.encouragement_notifications from anon, authenticated;
grant select on public.encouragement_notifications to authenticated;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 20 and 2048),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}=?$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}={0,2}$'),
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
using(user_id = auth.uid()) with check(user_id = auth.uid());
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- Registration is idempotent, bounded, and cannot take over another account's endpoint.
create or replace function public.register_push_subscription(push_endpoint text, push_key text, push_auth text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  perform 1 from public.profiles where id = auth.uid() for update;
  if push_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com)/[^[:space:]]+$' then
    raise exception 'This browser push service is not supported yet.';
  end if;
  select id into result from public.push_subscriptions where endpoint = push_endpoint and user_id = auth.uid();
  if result is not null then
    update public.push_subscriptions set p256dh = push_key, auth = push_auth where id = result;
    return result;
  end if;
  if (select count(*) from public.push_subscriptions where user_id = auth.uid()) >= 5 then raise exception 'Turn off notifications on an older device first (maximum five devices).'; end if;
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values(auth.uid(),push_endpoint,push_key,push_auth) returning id into result;
  return result;
end;
$$;
revoke all on function public.register_push_subscription(text,text,text) from public, anon;
grant execute on function public.register_push_subscription(text,text,text) to authenticated;

create or replace function public.read_encouragement(notification_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.encouragement_notifications n set read_at = coalesce(read_at, now())
  where n.id = notification_id and n.recipient_id = auth.uid()
    and public.is_partnership_member(n.partnership_id)
    and exists(select 1 from public.partnership_members m where m.partnership_id = n.partnership_id and m.user_id = n.sender_id);
end;
$$;
revoke all on function public.read_encouragement(uuid) from public, anon;
grant execute on function public.read_encouragement(uuid) to authenticated;

create table if not exists public.encouragement_push_queue (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.encouragement_notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','sending','sent','skipped','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_id uuid,
  finished_at timestamptz,
  unique(notification_id, subscription_id)
);
alter table public.encouragement_push_queue enable row level security;
revoke all on public.encouragement_push_queue from public, anon, authenticated;
grant all on public.encouragement_notifications, public.push_subscriptions, public.encouragement_push_queue to service_role;
create index if not exists encouragement_push_pending_idx on public.encouragement_push_queue(available_at) where status in ('pending','sending');

create or replace function public.queue_encouragement_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare space uuid; recipient uuid; notification uuid;
begin
  select w.partnership_id into space from public.weeks w join public.partnerships p on p.id = w.partnership_id
    where w.id = new.week_id and p.disconnected_at is null;
  if space is null or not exists(select 1 from public.partnership_members where partnership_id = space and user_id = new.author_id) then return new; end if;
  if (select count(*) from public.partnership_members where partnership_id = space) <> 2 then return new; end if;
  select user_id into recipient from public.partnership_members where partnership_id = space and user_id <> new.author_id;
  insert into public.encouragement_notifications(encouragement_id,recipient_id,sender_id,partnership_id,week_id)
    values(new.id,recipient,new.author_id,space,new.week_id)
    on conflict(encouragement_id,recipient_id) do nothing returning id into notification;
  if notification is not null then
    insert into public.encouragement_push_queue(notification_id,subscription_id)
      select notification,id from public.push_subscriptions where user_id = recipient;
  end if;
  return new;
end;
$$;
drop trigger if exists queue_encouragement_notification on public.encouragements;
create trigger queue_encouragement_notification after insert on public.encouragements
for each row execute function public.queue_encouragement_notification();

-- Only the server can claim work. Leases prevent overlapping workers taking the same job.
create or replace function public.claim_encouragement_push()
returns setof public.encouragement_push_queue language plpgsql security definer set search_path = '' as $$
begin
  update public.encouragement_push_queue set status = 'failed', finished_at = now()
    where status in ('pending','sending') and attempts >= 5 and available_at <= now();
  return query update public.encouragement_push_queue q set status = 'sending', attempts = attempts + 1,
    available_at = now() + interval '5 minutes', lease_id = gen_random_uuid()
  where q.id in (select id from public.encouragement_push_queue
    where status in ('pending','sending') and available_at <= now() and attempts < 5
    order by available_at for update skip locked limit 20)
  returning q.*;
end;
$$;
revoke all on function public.claim_encouragement_push() from public, anon, authenticated;
grant execute on function public.claim_encouragement_push() to service_role;
commit;
