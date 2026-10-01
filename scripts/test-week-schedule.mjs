import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db = new PGlite()
try {
  await db.exec(`
 create role authenticated; create role anon; create schema auth;
 create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
 `)
  const root = new URL('../supabase/migrations/', import.meta.url)
  for (const file of [
    '202609230001_initial_schema.sql',
    '202609230004_partner_repair.sql',
    '202609230005_weekly_review.sql',
    '202609230006_disconnect_partner.sql',
    '202609260007_week_schedule.sql',
    '202609260007_week_schedule.sql',
  ])
    await db.exec(
      (await readFile(new URL(file, root), 'utf8')).replace(
        'create extension if not exists pgcrypto;',
        '',
      ),
    )
  const a = '00000000-0000-4000-8000-000000000001',
    b = '00000000-0000-4000-8000-000000000002',
    c = '00000000-0000-4000-8000-000000000003'
  await db.query(
    "insert into auth.users(id,email) values($1,'a@example.com'),($2,'b@example.com'),($3,'c@example.com')",
    [a, b, c],
  )
  const pair = (await db.query('insert into partnerships(created_by) values($1) returning id', [a]))
    .rows[0].id
  await db.query('insert into partnership_members(partnership_id,user_id) values($1,$2),($1,$3)', [
    pair,
    a,
    b,
  ])
  const date = (await db.query("select (now() at time zone 'America/New_York')::date::text today"))
    .rows[0].today
  const old = (
    await db.query('select ($1::date-((extract(dow from $1::date)::integer+6)%7))::text start', [
      date,
    ])
  ).rows[0].start
  const start = (await db.query('select ($1::date+5)::text start', [old])).rows[0].start
  const week = (
    await db.query('insert into weeks(partnership_id,starts_on) values($1,$2) returning id', [
      pair,
      old,
    ])
  ).rows[0].id
  const goal = (
    await db.query(
      "insert into intentions(week_id,owner_id,title,kind,target) values($1,$2,'Practice','count',5) returning id",
      [week, a],
    )
  ).rows[0].id
  await db.query('insert into progress_entries(intention_id,user_id,value) values($1,$2,3)', [
    goal,
    a,
  ])
  const act = (user) => db.query("select set_config('test.uid',$1,false)", [user])
  const change = () => db.query("select change_week_schedule($1,6,'America/New_York')", [pair])
  await act(c)
  await assert.rejects(change(), /belong/)
  await act(a)
  await assert.rejects(change(), /Both partners/)
  const wrap = (user) =>
    db.query("select wrap_up_week($1,'A good week','Busy days',$2::uuid[],'[]') id", [
      week,
      user === a ? [goal] : [],
    ])
  const destination = (await wrap(a)).rows[0].id
  await assert.rejects(change(), /Both partners/)
  await act(b)
  await wrap(b)
  const nextGoal = (await db.query('select id from intentions where week_id=$1', [destination]))
    .rows[0].id
  await db.query('insert into progress_entries(intention_id,user_id,value) values($1,$2,1)', [
    nextGoal,
    a,
  ])
  await db.query(
    "insert into encouragements(week_id,author_id,message) values($1,$2,'Keep it up')",
    [destination, b],
  )
  const snapshot = (await db.query('select * from weekly_reviews order by user_id')).rows
  await change()
  assert.equal(
    (await db.query('select starts_on::text d from weeks where id=$1', [destination])).rows[0].d,
    start,
  )
  assert.equal(
    (await db.query('select starts_on::text d from weeks where id=$1', [week])).rows[0].d,
    old,
  )
  assert.deepEqual((await db.query('select * from weekly_reviews order by user_id')).rows, snapshot)
  assert.equal(
    (await db.query('select value from progress_entries where intention_id=$1', [nextGoal])).rows[0]
      .value,
    1,
  )
  assert.equal(
    (await db.query('select value from progress_entries where intention_id=$1', [goal])).rows[0]
      .value,
    3,
  )
  assert.equal(
    (await db.query('select count(*)::int n from encouragements where week_id=$1', [destination]))
      .rows[0].n,
    1,
  )
  await change()
  assert.equal((await db.query('select count(*)::int n from week_schedule_changes')).rows[0].n, 1)
  await act(a)
  assert.equal(
    (await wrap(a)).rows[0].id,
    destination,
    'saved review still links to the moved plan',
  )
  await assert.rejects(
    db.query('insert into weeks(partnership_id,starts_on) values($1,$2::date+7)', [pair, old]),
    /schedule changed/,
  )
  const next = (
    await db.query("select wrap_up_week($1,'Next cycle','',array[$2]::uuid[],'[]') id", [
      destination,
      nextGoal,
    ])
  ).rows[0].id
  assert.equal(
    (await db.query('select starts_on::text d from weeks where id=$1', [next])).rows[0].d,
    (await db.query('select ($1::date+7)::text d', [start])).rows[0].d,
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from progress_entries p join intentions i on p.intention_id=i.id where i.week_id=$1',
        [next],
      )
    ).rows[0].n,
    0,
  )
  await db.exec(
    'grant usage on schema public,auth to authenticated; grant select on partnerships,partnership_members to authenticated; set role authenticated',
  )
  await act(c)
  assert.equal((await db.query('select count(*)::int n from week_schedules')).rows[0].n, 0)
  await assert.rejects(change(), /belong/)
  await act(a)
  assert.equal((await db.query('select start_day from week_schedules')).rows[0].start_day, 6)
  await assert.rejects(db.query('update week_schedules set start_day=0'), /permission denied/)
  console.log(
    'PASS: migration reruns, membership checks, review guards, preserved IDs/history/progress/messages, retry safety, stale-client guard, Saturday rollover and schedule privacy.',
  )
  await db.exec('reset role')
  const partnerGoal = (
    await db.query(
      "insert into intentions(week_id,owner_id,title,kind,target) values($1,$2,'Read','count',100) returning id",
      [destination, b],
    )
  ).rows[0].id
  await db.query('insert into progress_entries(intention_id,user_id,value) values($1,$2,20)', [
    partnerGoal,
    b,
  ])
  await act(c)
  await assert.rejects(db.query('select disconnect_partner($1)', [pair]), /not a member/)
  await act(a)
  await db.query('select disconnect_partner($1)', [pair])
  for (const person of [a, b]) {
    const solo = (
      await db.query('select partnership_id from partnership_members where user_id=$1', [person])
    ).rows[0].partnership_id
    const schedule = (
      await db.query('select * from week_schedules where partnership_id=$1', [solo])
    ).rows[0]
    assert.equal(schedule.start_day, 6)
    assert.equal(schedule.timezone, 'America/New_York')
    const moved = (
      await db.query(
        'select w.starts_on::text d,p.value from intentions i join weeks w on w.id=i.week_id join progress_entries p on p.intention_id=i.id where i.id=$1 and w.partnership_id=$2',
        [person === a ? nextGoal : partnerGoal, solo],
      )
    ).rows[0]
    assert.equal(moved.d, start)
    assert.equal(moved.value, person === a ? 1 : 20)
  }
  assert.equal(
    (
      await db.query('select count(*)::int n from partnership_members where partnership_id=$1', [
        pair,
      ])
    ).rows[0].n,
    0,
  )
  assert.equal(
    (await db.query('select count(*)::int n from weekly_reviews where week_id=$1', [week])).rows[0]
      .n,
    2,
  )
  console.log(
    'PASS: approved disconnection preserves both schedules, dates, goal IDs and progress; shared review records retained.',
  )
} finally {
  await db.close()
}
