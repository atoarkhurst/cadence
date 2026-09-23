import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db = new PGlite()
try {
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('email',current_setting('test.email',true)) $$;
  `)
  const root = new URL('../supabase/migrations/', import.meta.url)
  await db.exec((await readFile(new URL('202609230001_initial_schema.sql', root), 'utf8')).replace('create extension if not exists pgcrypto;', ''))
  const migration = await readFile(new URL('202609230005_weekly_review.sql', root), 'utf8')
  await db.exec(migration)
  await db.exec(migration)
  const a = '00000000-0000-4000-8000-000000000001'
  const b = '00000000-0000-4000-8000-000000000002'
  const outsider = '00000000-0000-4000-8000-000000000003'
  await db.query("insert into auth.users(id,email) values ($1,'a@example.com'),($2,'b@example.com'),($3,'c@example.com')", [a,b,outsider])
  const pair = (await db.query('insert into partnerships(created_by) values ($1) returning id', [a])).rows[0].id
  await db.query('insert into partnership_members(partnership_id,user_id) values ($1,$2),($1,$3)', [pair,a,b])
  const week = (await db.query("insert into weeks(partnership_id,starts_on) values ($1,'2026-12-28') returning id", [pair])).rows[0].id
  const goal = (await db.query("insert into intentions(week_id,owner_id,title,kind,target) values ($1,$2,'Read pages','count',100) returning id", [week,a])).rows[0].id
  await db.query('insert into progress_entries(intention_id,user_id,value) values ($1,$2,25)', [goal,a])
  const act = (user) => db.query("select set_config('test.uid',$1,false)", [user])
  const wrap = (ids, goals='[]') => db.query('select wrap_up_week($1,$2,$3,$4::uuid[],$5::jsonb) id', [week,'Made time','Too much scrolling',ids,goals])
  await act(outsider)
  await assert.rejects(wrap([goal]), /belong/)
  await act(b)
  await assert.rejects(wrap([goal]), /own intentions/)
  await act(a)
  await assert.rejects(wrap([goal], JSON.stringify([{ name:'Broken', kind:'count', target:0 }])), /positive target/)
  assert.equal((await db.query('select count(*)::int n from weekly_reviews')).rows[0].n, 0, 'failed plan rolls back reflection')
  const next = (await wrap([goal], JSON.stringify([{ name:'Apply for a job', kind:'one_time' }]))).rows[0].id
  await wrap([goal], JSON.stringify([{ name:'Apply for a job', kind:'one_time' }]))
  assert.equal((await db.query('select count(*)::int n from intentions where week_id=$1', [next])).rows[0].n, 2, 'retry does not duplicate')
  assert.equal((await db.query('select value from progress_entries where intention_id=$1', [goal])).rows[0].value, 25)
  assert.equal((await db.query('select week_id from intentions where id=$1', [goal])).rows[0].week_id, week)
  assert.equal((await db.query('select count(*)::int n from progress_entries p join intentions i on i.id=p.intention_id where i.week_id=$1', [next])).rows[0].n, 0, 'next week starts fresh')
  assert.equal((await db.query('select starts_on::text d from weeks where id=$1', [next])).rows[0].d, '2027-01-04')
  await act(b); await wrap([])
  assert.equal((await db.query('select count(*)::int n from weekly_reviews where week_id=$1',[week])).rows[0].n,2)
  // Exercise row-level visibility under a non-owner database role.
  await db.exec('grant usage on schema public,auth to authenticated; grant select on public.weeks,public.partnership_members to authenticated; set role authenticated;')
  await act(a)
  assert.equal((await db.query('select count(*)::int n from weekly_reviews')).rows[0].n,2)
  await act(outsider)
  assert.equal((await db.query('select count(*)::int n from weekly_reviews')).rows[0].n,0)
  await assert.rejects(db.query("update weekly_reviews set went_well='overwritten'"), /permission denied/)
  console.log('PASS: review isolation, partner visibility, atomic rollback, retry safety, independent reviews, fresh next-week progress, preserved history.')

  await db.exec('reset role')
  await db.exec(await readFile(new URL('202609230004_partner_repair.sql', root), 'utf8'))
  const disconnectSQL = await readFile(new URL('202609230006_disconnect_partner.sql', root), 'utf8')
  await db.exec(disconnectSQL); await db.exec(disconnectSQL)
  const otherGoal = (await db.query("insert into intentions(week_id,owner_id,title,kind) values ($1,$2,'Walk','one_time') returning id",[week,b])).rows[0].id
  const invitation = (await db.query("insert into invitations(partnership_id,email,invited_by) values($1,'b@example.com',$2) returning token",[pair,a])).rows[0].token
  await act(outsider)
  await assert.rejects(db.query('select disconnect_partner($1)',[pair]), /not a member/)
  await act(b)
  await db.query('select disconnect_partner($1)',[pair])
  await assert.rejects(db.query('select disconnect_partner($1)',[pair]), /not a member/)
  assert.equal((await db.query('select count(*)::int n from partnership_members where partnership_id=$1',[pair])).rows[0].n,0)
  assert.equal((await db.query('select value from progress_entries where intention_id=$1',[goal])).rows[0].value,25)
  const aWeek = (await db.query('select week_id from intentions where id=$1',[goal])).rows[0].week_id
  const bWeek = (await db.query('select week_id from intentions where id=$1',[otherGoal])).rows[0].week_id
  assert.notEqual(aWeek,bWeek)
  await db.query("select set_config('test.email','b@example.com',false)")
  await assert.rejects(db.query('select accept_invitation($1)',[invitation]), /expired/)
  await assert.rejects(db.query('insert into partnership_members(partnership_id,user_id) values($1,$2)',[pair,a]), /ended/)
  await db.exec('grant select,insert,update,delete on all tables in schema public to authenticated; set role authenticated')
  await act(b)
  assert.equal((await db.query('select count(*)::int n from intentions where id=$1',[goal])).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from intentions where id=$1',[otherGoal])).rows[0].n,1)
  assert.equal((await db.query('select count(*)::int n from weekly_reviews')).rows[0].n,0)
  await assert.rejects(db.query('insert into progress_entries(intention_id,user_id,value) values($1,$2,1)',[goal,b]), /row-level security/)
  await assert.rejects(db.query("insert into encouragements(week_id,author_id,message) values($1,$2,'Hello')",[aWeek,b]), /row-level security/)
  console.log('PASS: either member can disconnect, goals/progress preserved, old invitations blocked, former-partner reads and writes denied, shared reviews hidden.')

} finally { await db.close() }
