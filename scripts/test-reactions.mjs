import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
const db = new PGlite()
const root = new URL('../supabase/migrations/', import.meta.url)
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
const act = (id) => db.query("select set_config('test.uid',$1,false)", [id])
try {
  await db.exec(`create role authenticated; create role anon; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
    grant usage on schema public,auth to authenticated,anon;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;`)
  for (const file of (await readdir(root)).sort())
    await db.exec(
      (await readFile(new URL(file, root), 'utf8')).replace(
        'create extension if not exists pgcrypto;',
        '',
      ),
    )
  const a = randomUUID(),
    b = randomUUID(),
    c = randomUUID()
  await db.query(
    "insert into auth.users(id,email) values($1,'a@example.com'),($2,'b@example.com'),($3,'c@example.com')",
    [a, b, c],
  )
  const pair = await scalar('insert into partnerships(created_by) values($1) returning id', [a])
  await db.query('insert into partnership_members(partnership_id,user_id) values($1,$2),($1,$3)', [
    pair,
    a,
    b,
  ])
  const week = await scalar(
    "insert into weeks(partnership_id,starts_on) values($1,'2026-09-28') returning id",
    [pair],
  )
  const note = await scalar(
    "insert into encouragements(week_id,author_id,message) values($1,$2,'Keep going') returning id",
    [week, a],
  )
  const before = (await db.query('select * from encouragements')).rows
  const notices = await scalar('select count(*)::int from encouragement_notifications')
  const pushes = await scalar('select count(*)::int from encouragement_push_queue')
  await db.exec(await readFile(new URL('202610010012_encouragement_hearts.sql', root), 'utf8'))
  assert.deepEqual((await db.query('select * from encouragements')).rows, before)
  await db.exec('set role authenticated')
  await act(a)
  await assert.rejects(db.query('select set_encouragement_heart($1,true)', [note]), /recipient/)
  await act(c)
  await assert.rejects(db.query('select set_encouragement_heart($1,true)', [note]), /recipient/)
  await act(b)
  await assert.rejects(
    db.query('insert into encouragement_reactions(encouragement_id,user_id) values($1,$2)', [
      note,
      b,
    ]),
    /permission denied/,
  )
  await db.query('select set_encouragement_heart($1,true)', [note])
  await db.query('select set_encouragement_heart($1,true)', [note])
  assert.equal(await scalar('select count(*)::int from encouragement_reactions'), 1)
  await act(a)
  assert.equal(await scalar('select count(*)::int from encouragement_reactions'), 1)
  await act(c)
  assert.equal(await scalar('select count(*)::int from encouragement_reactions'), 0)
  await act(b)
  await db.query('select set_encouragement_heart($1,false)', [note])
  assert.equal(await scalar('select count(*)::int from encouragement_reactions'), 0)
  await db.query('select set_encouragement_heart($1,true)', [note])
  await db.exec('reset role')
  assert.equal(await scalar('select count(*)::int from encouragement_notifications'), notices)
  assert.equal(await scalar('select count(*)::int from encouragement_push_queue'), pushes)
  await db.exec('set role anon')
  await assert.rejects(
    db.query('select set_encouragement_heart($1,true)', [note]),
    /permission denied/,
  )
  await db.exec('set role authenticated')
  await act(b)
  await db.query('select disconnect_partner($1)', [pair])
  assert.equal(await scalar('select count(*)::int from encouragement_reactions'), 0)
  await assert.rejects(db.query('select set_encouragement_heart($1,false)', [note]), /recipient/)
  console.log(
    'Heart permissions, retry safety, undo, disconnect, history preservation and no additional notifications passed.',
  )
} finally {
  await db.close()
}
