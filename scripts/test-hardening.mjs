import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const db = new PGlite()
const root = new URL('../supabase/migrations/', import.meta.url)
const apply = async (file) =>
  db.exec(
    (await readFile(new URL(file, root), 'utf8')).replace(
      'create extension if not exists pgcrypto;',
      '',
    ),
  )
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
const act = async (id, email) =>
  db.query("select set_config('test.uid',$1,false),set_config('test.email',$2,false)", [id, email])
try {
  await db.exec(`create role authenticated; create role anon; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('email',current_setting('test.email',true)) $$;`)
  for (const file of (await readdir(root)).sort().filter((file) => file < '20261001'))
    await apply(file)
  const a = randomUUID(),
    b = randomUUID(),
    c = randomUUID()
  await db.query(
    "insert into auth.users(id,email) values($1,'a@example.com'),($2,'b@example.com'),($3,'c@example.com')",
    [a, b, c],
  )
  const pair = await scalar('insert into partnerships(created_by) values($1) returning id', [a])
  const other = await scalar('insert into partnerships(created_by) values($1) returning id', [c])
  await db.query(
    'insert into partnership_members(partnership_id,user_id) values($1,$2),($1,$3),($4,$5)',
    [pair, a, b, other, c],
  )
  const week = await scalar(
    "insert into weeks(partnership_id,starts_on) values($1,'2026-09-28') returning id",
    [pair],
  )
  const otherWeek = await scalar(
    "insert into weeks(partnership_id,starts_on) values($1,'2026-10-05') returning id",
    [other],
  )
  const goal = await scalar(
    "insert into intentions(week_id,owner_id,title,kind) values($1,$2,'Completed yesterday','one_time') returning id",
    [week, b],
  )
  await db.query(
    'insert into progress_entries(intention_id,user_id,value,recorded_on) values($1,$2,1,current_date-1)',
    [goal, b],
  )
  const invitation = await scalar(
    "insert into invitations(partnership_id,email,invited_by) values($1,'c@example.com',$2) returning token",
    [pair, a],
  )
  const snapshot = (await db.query('select * from progress_entries')).rows
  // Match the pre-existing public API grants, then let migrations narrow them.
  await db.exec(
    'grant usage on schema public,auth to authenticated,anon; grant select,insert,update,delete on all tables in schema public to authenticated;',
  )
  for (let repeat = 0; repeat < 2; repeat++) {
    await apply('202610010009_access_hardening.sql')
    await apply('202610010010_progress_corrections.sql')
    await apply('202610010011_creation_limits.sql')
  }
  assert.deepEqual(
    (await db.query('select * from progress_entries')).rows,
    snapshot,
    'migrations preserve original history',
  )
  await db.exec('set role authenticated')
  await act(a, 'a@example.com')
  assert.equal(await scalar('select count(*)::int from profiles where id=$1', [b]), 1)
  assert.equal(await scalar('select count(*)::int from profiles where id=$1', [c]), 0)
  assert.equal(
    (await db.query('delete from intentions where id=$1 returning id', [goal])).rows.length,
    0,
  )
  assert.equal(
    (await db.query('update intentions set owner_id=$1 where id=$2 returning id', [a, goal])).rows
      .length,
    0,
  )
  await assert.rejects(db.query('delete from weeks where id=$1', [week]), /permission denied/)
  await assert.rejects(
    db.query('update weeks set next_week_id=$1 where id=$2', [otherWeek, week]),
    /permission denied/,
  )
  await assert.rejects(
    db.query(
      'insert into weeks(partnership_id,starts_on,next_week_id) values($1,current_date,$2)',
      [pair, otherWeek],
    ),
    /permission denied/,
  )
  const next = await scalar("select wrap_up_week($1,'Good','',array[]::uuid[],'[]')", [week])
  assert.equal(await scalar('select partnership_id from weeks where id=$1', [next]), pair)
  await assert.rejects(
    db.query('select set_intention_progress($1,0,1,$2)', [goal, randomUUID()]),
    /own current/,
  )
  await act(b, 'b@example.com')
  for (let i = 0; i < 12; i++)
    await db.query('insert into encouragements(week_id,author_id,message) values($1,$2,$3)', [
      week,
      b,
      'Test note ' + i,
    ])
  await assert.rejects(
    db.query("insert into encouragements(week_id,author_id,message) values($1,$2,'Too many')", [
      week,
      b,
    ]),
    /several notes/,
  )
  const operation = randomUUID()
  assert.equal(await scalar('select set_intention_progress($1,0,1,$2)', [goal, operation]), 0)
  assert.equal(
    await scalar('select set_intention_progress($1,0,1,$2)', [goal, operation]),
    0,
    'retry is idempotent',
  )
  assert.equal(
    await scalar('select count(*)::int from progress_adjustments where intention_id=$1', [goal]),
    1,
  )
  assert.equal(
    await scalar('select sum(value)::int from progress_entries where intention_id=$1', [goal]),
    1,
    'original completion retained',
  )
  assert.equal(
    await scalar('select sum(value)::int from progress_adjustments where intention_id=$1', [goal]),
    -1,
    'correction cancels previous-day completion',
  )
  await assert.rejects(
    db.query('select set_intention_progress($1,1,1,$2)', [goal, randomUUID()]),
    /another device/,
  )
  await assert.rejects(
    db.query('select set_intention_progress($1,2,0,$2)', [goal, randomUUID()]),
    /complete or incomplete/,
  )
  assert.equal(await scalar('select set_intention_progress($1,1,0,$2)', [goal, randomUUID()]), 1)
  await assert.rejects(
    db.query('delete from progress_entries where intention_id=$1', [goal]),
    /permission denied/,
  )
  await assert.rejects(
    db.query('insert into progress_adjustments(operation_id) values($1)', [randomUUID()]),
    /permission denied/,
  )
  await act(c, 'c@example.com')
  assert.equal(await scalar('select count(*)::int from profiles where id=$1', [a]), 0)
  assert.equal(
    (await db.query('select * from pending_invitations()')).rows[0].token,
    invitation,
    'private sender lookup preserves invitation UX',
  )
  assert.equal(await scalar('select count(*)::int from progress_adjustments'), 0)
  assert.equal(await scalar('select ensure_workspace()'), other)
  assert.equal(await scalar('select ensure_workspace()'), other, 'initialization is idempotent')
  await assert.rejects(
    db.query("select wrap_up_week($1,'','',array[]::uuid[],'[]')", [week]),
    /belong/,
  )
  await db.exec('reset role')
  await assert.rejects(
    db.query('update weeks set next_week_id=$1 where id=$2', [otherWeek, week]),
    /weeks_next_same_partnership/,
    'even elevated writes cannot create a foreign link',
  )
  await db.exec('set role authenticated')
  await act(b, 'b@example.com')
  await db.query('select disconnect_partner($1)', [pair])
  assert.equal(
    await scalar('select count(*)::int from progress_adjustments where intention_id=$1', [goal]),
    2,
    'owner retains corrections after disconnect',
  )
  await act(a, 'a@example.com')
  assert.equal(
    (await db.query('delete from encouragements where author_id=$1 returning id', [b])).rows.length,
    0,
  )
  assert.equal(
    await scalar('select count(*)::int from progress_adjustments where intention_id=$1', [goal]),
    0,
    'former partner loses access',
  )
  assert.equal(await scalar('select count(*)::int from profiles where id=$1', [b]), 0)
  await db.exec('reset role; set role anon')
  await act('', '')
  await assert.rejects(db.query('select ensure_workspace()'), /permission denied/)
  await assert.rejects(db.query('select pending_invitations()'), /permission denied/)
  await assert.rejects(
    db.query('select set_intention_progress($1,0,1,$2)', [goal, randomUUID()]),
    /permission denied/,
  )
  console.log(
    'PASS: migration reruns preserve history; partner delete/takeover denied; foreign week links blocked; private profiles/invites; cross-day correction, retry and stale-device guards; disconnect privacy; anonymous RPC denial.',
  )
} finally {
  await db.close()
}
