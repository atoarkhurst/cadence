import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { allowedEndpoint, retryableStatus } from '../supabase/functions/encouragement-push/rules.mjs'

const db = new PGlite()
try {
  await db.exec(`create role authenticated; create role anon; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;`)
  const root = new URL('../supabase/migrations/', import.meta.url)
  for (const file of ['202609230001_initial_schema.sql','202609230004_partner_repair.sql','202609230005_weekly_review.sql','202609230006_disconnect_partner.sql','202609260007_week_schedule.sql']) {
    await db.exec((await readFile(new URL(file, root), 'utf8')).replace('create extension if not exists pgcrypto;', ''))
  }
  const a = '00000000-0000-4000-8000-000000000001', b = '00000000-0000-4000-8000-000000000002', c = '00000000-0000-4000-8000-000000000003'
  await db.query("insert into auth.users(id,email) values($1,'a@example.com'),($2,'b@example.com'),($3,'c@example.com')", [a,b,c])
  const pair = (await db.query('insert into partnerships(created_by) values($1) returning id',[a])).rows[0].id
  await db.query('insert into partnership_members(partnership_id,user_id) values($1,$2),($1,$3)',[pair,a,b])
  const week = (await db.query("insert into weeks(partnership_id,starts_on) values($1,'2026-09-28') returning id",[pair])).rows[0].id
  const cheer = async (author, message = 'You have this') => (await db.query('insert into encouragements(week_id,author_id,message) values($1,$2,$3) returning id',[week,author,message])).rows[0].id
  await cheer(a,'Existing history')
  const migration = await readFile(new URL('202609290008_encouragement_notifications.sql',root),'utf8')
  await db.exec(migration); await db.exec(migration)
  assert.equal((await db.query('select count(*)::int n from encouragement_notifications')).rows[0].n,0,'old messages not backfilled as unread')
  const act = user => db.query("select set_config('test.uid',$1,false)",[user])
  await act(b)
  const key = 'B'.repeat(87), auth = 'a'.repeat(22), endpoint = 'https://web.push.apple.com/test-subscription'
  const register = () => db.query('select register_push_subscription($1,$2,$3) id',[endpoint,key,auth])
  const subscription = (await register()).rows[0].id
  assert.equal((await register()).rows[0].id,subscription,'registration idempotent')
  await assert.rejects(db.query('select register_push_subscription($1,$2,$3)',['http://127.0.0.1/private',key,auth]),/not supported/)
  await act(a)
  await assert.rejects(register(),/unique/,'another account cannot steal endpoint')
  const message = await cheer(a)
  const notice = (await db.query('select * from encouragement_notifications')).rows[0]
  assert.equal(notice.recipient_id,b); assert.equal(notice.sender_id,a)
  assert.equal(notice.encouragement_id,message)
  assert.equal((await db.query('select count(*)::int n from encouragement_push_queue')).rows[0].n,1)
  const first = (await db.query('select * from claim_encouragement_push()')).rows
  assert.equal(first.length,1); assert.equal(first[0].attempts,1)
  assert.equal((await db.query('select * from claim_encouragement_push()')).rows.length,0,'leased job not claimed twice')
  await db.query("update encouragement_push_queue set available_at=now()-interval '1 minute'")
  const retried = (await db.query('select * from claim_encouragement_push()')).rows[0]
  assert.equal(retried.attempts,2); assert.notEqual(retried.lease_id,first[0].lease_id)
  await db.exec('grant usage on schema public,auth to authenticated; grant select on partnerships,partnership_members,weeks,profiles,encouragements to authenticated; grant insert on encouragements to authenticated; set role authenticated')
  await act(a)
  assert.equal((await db.query('select * from encouragement_notifications')).rows.length,0,'sender cannot read recipient receipts')
  await db.query('select read_encouragement($1)',[notice.id])
  await assert.rejects(db.query('select * from encouragement_push_queue'),/permission denied/)
  await assert.rejects(db.query('select * from claim_encouragement_push()'),/permission denied/)
  await act(c)
  assert.equal((await db.query('select * from push_subscriptions')).rows.length,0)
  await assert.rejects(cheer(c),/row-level security/)
  await act(b)
  assert.equal((await db.query('select read_at from encouragement_notifications')).rows[0].read_at,null)
  await db.query('select read_encouragement($1)',[notice.id])
  const read = (await db.query('select read_at from encouragement_notifications')).rows[0].read_at
  await db.query('select read_encouragement($1)',[notice.id])
  assert.deepEqual((await db.query('select read_at from encouragement_notifications')).rows[0].read_at,read,'read is idempotent')
  await assert.rejects(db.query("update encouragement_notifications set recipient_id=$1",[a]),/permission denied/)
  await db.query('delete from push_subscriptions where id=$1',[subscription])
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::int n from encouragement_push_queue')).rows[0].n,0,'turning off removes queued deliveries')
  await cheer(a)
  assert.equal((await db.query('select count(*)::int n from encouragement_push_queue')).rows[0].n,0,'no opt-in means no push')
  await act(a); await db.query('select disconnect_partner($1)',[pair])
  await db.exec('set role authenticated'); await act(b)
  assert.equal((await db.query('select * from encouragement_notifications')).rows.length,0,'former partner notes no longer accessible')
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::int n from encouragements')).rows[0].n,3,'message history preserved')
  console.log('PASS: additive migration/rerun, no old alerts, recipient isolation, opt-in, read receipts, subscription ownership, leases/retries, unsubscribe cancellation, disconnect privacy, preserved history.')
} finally { await db.close() }
for (const endpoint of ['https://fcm.googleapis.com/send/123','https://web.push.apple.com/abc','https://updates.push.services.mozilla.com/wpush/abc']) assert.equal(allowedEndpoint(endpoint),true)
for (const endpoint of ['http://fcm.googleapis.com/x','https://fcm.googleapis.com.evil.test/x','https://user@web.push.apple.com/x','https://localhost/x','https://web.push.apple.com:444/x']) assert.equal(allowedEndpoint(endpoint),false)
assert.equal(retryableStatus(429),true); assert.equal(retryableStatus(503),true); assert.equal(retryableStatus(400),false)
console.log('PASS: push endpoint allowlist and retry rules.')
