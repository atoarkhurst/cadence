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
  for (const file of (await readdir(root)).sort().filter((f) => f < '20261005')) await apply(file)
  const a = randomUUID(),
    b = randomUUID(),
    c = randomUUID(),
    d = randomUUID()
  await db.query(
    "insert into auth.users(id,email) values($1,'a@example.com'),($2,'b@example.com'),($3,'c@example.com'),($4,'d@example.com')",
    [a, b, c, d],
  )
  const ab = await scalar('insert into partnerships(created_by) values($1) returning id', [a])
  const solo = await scalar('insert into partnerships(created_by) values($1) returning id', [c])
  const emptySolo = await scalar('insert into partnerships(created_by) values($1) returning id', [
    a,
  ])
  await db.query(
    'insert into partnership_members(partnership_id,user_id) values($1,$2),($1,$3),($4,$5),($6,$7)',
    [ab, a, b, solo, c, emptySolo, a],
  )
  const week = await scalar(
    "insert into weeks(partnership_id,starts_on) values($1,'2026-10-03') returning id",
    [ab],
  )
  const soloWeek = await scalar(
    "insert into weeks(partnership_id,starts_on) values($1,'2026-10-05') returning id",
    [solo],
  )
  const goal = await scalar(
    "insert into intentions(week_id,owner_id,title,kind) values($1,$2,'Original shared goal','one_time') returning id",
    [week, a],
  )
  const soloGoal = await scalar(
    "insert into intentions(week_id,owner_id,title,kind) values($1,$2,'Private fitness goal','one_time') returning id",
    [soloWeek, c],
  )
  await db.query('insert into progress_entries(intention_id,user_id,value) values($1,$2,1)', [
    goal,
    a,
  ])
  const snapshot = (await db.query('select * from intentions order by id')).rows
  // Apply realistic baseline grants before re-applying restrictive migrations.
  await db.exec(
    'grant usage on schema public,auth to authenticated,anon; grant select,insert,update,delete on all tables in schema public to authenticated;',
  )
  for (const f of [
    '202610010009_access_hardening.sql',
    '202610010010_progress_corrections.sql',
    '202610010011_creation_limits.sql',
    '202610010012_encouragement_hearts.sql',
  ])
    await apply(f)
  await apply('202610050013_separate_partnerships.sql')
  await apply('202610050013_separate_partnerships.sql')
  await apply('202610060014_personal_plan_picker.sql')
  await apply('202610060014_personal_plan_picker.sql')
  await apply('202610060015_personal_plan_fallback.sql')
  await apply('202610060015_personal_plan_fallback.sql')
  const duplicate = await scalar('insert into partnerships(created_by) values($1) returning id', [
    a,
  ])
  await db.query('insert into partnership_members(partnership_id,user_id) values($1,$2),($1,$3)', [
    duplicate,
    a,
    b,
  ])
  await assert.rejects(apply('202610060016_pair_safety.sql'), /Duplicate active partner pairs/)
  await db.exec('rollback')
  await db.query('delete from partnership_members where partnership_id=$1', [duplicate])
  await db.query('delete from partnerships where id=$1', [duplicate])
  await apply('202610060016_pair_safety.sql')
  await apply('202610060016_pair_safety.sql')
  assert.deepEqual(
    (await db.query('select * from intentions order by id')).rows,
    snapshot,
    'migration reruns preserve all existing goals',
  )
  await db.exec('set role authenticated')
  await act(a, 'a@example.com')
  await assert.rejects(
    db.query('insert into partnership_members(partnership_id,user_id) values($1,$2)', [solo, a]),
    /permission denied/,
  )
  await assert.rejects(
    db.query(
      "insert into invitations(partnership_id,email,invited_by) values($1,'d@example.com',$2)",
      [ab, a],
    ),
    /permission denied/,
  )
  await assert.rejects(
    db.query("select create_partner_invitation('a@example.com',null)"),
    /rather than your own/,
  )
  await assert.rejects(
    db.query("select create_partner_invitation('d@example.com',$1)", [solo]),
    /not available/,
  )
  await assert.rejects(
    db.query("select create_partner_invitation('b@example.com',null)"),
    /already have/,
  )
  await assert.rejects(
    db.query("select create_partner_invitation('d@example.com',$1)", [ab]),
    /two people/,
  )
  const invite = (await db.query("select * from create_partner_invitation(' C@example.com ',null)"))
    .rows[0]
  await assert.rejects(
    db.query("select * from create_partner_invitation('c@example.com',null)"),
    /pending invitation.*another plan/,
    'a retry without an explicit plan cannot silently return a different plan',
  )
  const targeted = (
    await db.query("select * from create_partner_invitation('d@example.com',$1)", [emptySolo])
  ).rows[0]
  assert.equal(
    (await db.query("select * from create_partner_invitation('d@example.com',$1)", [emptySolo]))
      .rows[0].token,
    targeted.token,
    'retry for the same explicit plan remains idempotent',
  )
  await assert.rejects(
    db.query("select * from create_partner_invitation('d@example.com',null)"),
    /pending invitation.*another plan/,
  )
  await db.query('select cancel_partner_invitation($1)', [targeted.token])
  assert.equal((await db.query('select * from list_partnerships()')).rows.length, 3)
  assert.equal(
    (await db.query('select id from list_partnerships_for_picker() where id=$1', [emptySolo])).rows
      .length,
    0,
    'unused solo plan is hidden once connected',
  )
  await act(b, 'b@example.com')
  assert.equal(
    (await db.query('select * from invitation_details($1)', [invite.token])).rows.length,
    0,
  )
  await assert.rejects(db.query('select accept_invitation($1)', [invite.token]), /email/)
  await assert.rejects(
    db.query('select cancel_partner_invitation($1)', [invite.token]),
    /no longer pending/,
  )
  await act(c, 'c@example.com')
  assert.equal(
    (await db.query('select id from list_partnerships_for_picker() where id=$1', [solo])).rows
      .length,
    1,
    'personal plan with a goal remains available',
  )
  assert.equal((await db.query('select * from pending_invitations()')).rows[0].token, invite.token)
  assert.equal(
    (await db.query('select * from invitation_details($1)', [invite.token])).rows.length,
    1,
  )
  const ac = await scalar('select accept_invitation($1)', [invite.token])
  assert.equal(
    await scalar('select accept_invitation($1)', [invite.token]),
    ac,
    'acceptance is idempotent',
  )
  assert.equal(
    await scalar('select week_id from intentions where id=$1', [soloGoal]),
    soloWeek,
    'joining never moves private goals',
  )
  assert.equal(
    await scalar('select count(*)::int from intentions where id=$1', [goal]),
    0,
    'C cannot read A/B goals',
  )
  const acWeek = await scalar(
    "insert into weeks(partnership_id,starts_on) values($1,'2026-10-05') returning id",
    [ac],
  )
  const acGoal = await scalar(
    "insert into intentions(week_id,owner_id,title,kind) values($1,$2,'New pair goal','one_time') returning id",
    [acWeek, c],
  )
  await db.exec('reset role')
  await db.query(
    "insert into week_schedules(partnership_id,start_day,previous_day,effective_on,timezone,updated_by) values($1,1,1,'2026-10-01','America/New_York',$2)",
    [ac, a],
  )
  await db.exec('set role authenticated')
  await db.query(
    "insert into encouragements(week_id,author_id,message) values($1,$2,'You can do it')",
    [acWeek, c],
  )
  await act(b, 'b@example.com')
  assert.equal(
    await scalar('select count(*)::int from intentions where id=$1', [acGoal]),
    0,
    'B cannot read A/C goals',
  )
  assert.equal(
    await scalar('select count(*)::int from encouragements where week_id=$1', [acWeek]),
    0,
  )
  await assert.rejects(db.query('select disconnect_partner($1)', [ac]), /not a member/)
  await act(a, 'a@example.com')
  assert.equal(
    await scalar('select count(*)::int from encouragement_notifications where partnership_id=$1', [
      ac,
    ]),
    1,
    'notification belongs to correct pair',
  )
  const inviteD = (await db.query("select * from create_partner_invitation('d@example.com',null)"))
    .rows[0]
  await db.query('select cancel_partner_invitation($1)', [inviteD.token])
  await act(d, 'd@example.com')
  await assert.rejects(
    db.query('select accept_invitation($1)', [inviteD.token]),
    /expired or was cancelled/,
  )
  await act(a, 'a@example.com')
  const reciprocalA = (
    await db.query("select * from create_partner_invitation('d@example.com',null)")
  ).rows[0]
  await act(d, 'd@example.com')
  const reciprocalD = (
    await db.query("select * from create_partner_invitation('a@example.com',null)")
  ).rows[0]
  await db.query('select accept_invitation($1)', [reciprocalA.token])
  await act(a, 'a@example.com')
  await assert.rejects(
    db.query('select accept_invitation($1)', [reciprocalD.token]),
    /already connected/,
  )
  await db.query('select disconnect_partner($1)', [ac])
  assert.equal(
    await scalar('select week_id from intentions where id=$1', [goal]),
    week,
    'disconnect leaves other pair untouched',
  )
  assert.equal(
    await scalar('select sum(value)::int from progress_entries where intention_id=$1', [goal]),
    1,
  )
  assert.equal(
    await scalar('select count(*)::int from encouragement_notifications where partnership_id=$1', [
      ac,
    ]),
    0,
    'closed pair notifications are inaccessible',
  )
  await act(c, 'c@example.com')
  assert.equal(
    await scalar(
      'select timezone from week_schedules where partnership_id=(select w.partnership_id from weeks w join intentions i on i.week_id=w.id where i.id=$1)',
      [acGoal],
    ),
    'America/New_York',
    'disconnect preserves the pair schedule in the new private plan',
  )
  assert.equal(
    await scalar('select count(*)::int from intentions where id=$1', [acGoal]),
    1,
    'owner retains goal after disconnect',
  )
  assert.equal(
    await scalar('select week_id from intentions where id=$1', [soloGoal]),
    soloWeek,
    'other private history stays unchanged',
  )
  await assert.rejects(
    db.query('select accept_invitation($1)', [invite.token]),
    /connection has ended/,
  )

  // Regression: a last-partner disconnect must not resurrect empty signup
  // plans, hide older goals, or let another account enumerate personal plans.
  await db.exec('reset role')
  const emptyC = await scalar('insert into partnerships(created_by) values($1) returning id', [c])
  await db.query('insert into partnership_members(partnership_id,user_id) values($1,$2)', [
    emptyC,
    c,
  ])
  await db.exec('set role authenticated')
  const personalChoices = (await db.query('select * from list_partnerships_for_picker()')).rows
  assert.equal(personalChoices.length, 2, 'both used personal plans remain accessible')
  assert.ok(
    !personalChoices.some((p) => p.id === emptyC),
    'empty signup plan stays hidden without a partner',
  )
  assert.ok(
    personalChoices.some((p) => p.id === solo),
    'older personal history remains accessible',
  )
  const retainedPlan = await scalar(
    'select partnership_id from weeks where id=(select week_id from intentions where id=$1)',
    [acGoal],
  )
  assert.ok(
    personalChoices.some((p) => p.id === retainedPlan),
    'goals retained after disconnect remain accessible',
  )
  const defaultPersonal = await scalar('select ensure_workspace()')
  assert.ok(
    personalChoices.some((p) => p.id === defaultPersonal),
    'default is one of the visible used plans',
  )
  await act(a, 'a@example.com')
  assert.equal(
    (await db.query('select * from list_partnerships_for_picker()')).rows.filter((p) =>
      personalChoices.some((own) => own.id === p.id),
    ).length,
    0,
    'former partner cannot enumerate personal plans',
  )
  assert.equal(
    await scalar('select count(*)::int from intentions where id=$1', [acGoal]),
    0,
    'former partner cannot read retained goals',
  )
  assert.equal(
    await scalar('select count(*)::int from encouragements where week_id=$1', [acWeek]),
    0,
    'former partner cannot read closed shared notes',
  )

  await db.exec('reset role')
  const newcomer = randomUUID()
  await db.query("insert into auth.users(id,email) values($1,'new@example.com')", [newcomer])
  await db.exec('set role authenticated')
  await act(newcomer, 'new@example.com')
  const starter = await scalar('select ensure_workspace()')
  assert.equal(
    await scalar('select ensure_workspace()'),
    starter,
    'first-use retries keep one starter',
  )
  await db.exec('reset role')
  const extra = await scalar('insert into partnerships(created_by) values($1) returning id', [
    newcomer,
  ])
  await db.query('insert into partnership_members(partnership_id,user_id) values($1,$2)', [
    extra,
    newcomer,
  ])
  await db.exec('set role authenticated')
  assert.equal(
    (await db.query('select * from list_partnerships_for_picker()')).rows.length,
    1,
    'multiple empty plans offer exactly one starter',
  )
  const historicalWeek = await scalar(
    "insert into weeks(partnership_id,starts_on) values($1,'2026-01-05') returning id",
    [extra],
  )
  await db.exec('reset role')
  await db.query(
    "insert into weekly_reviews(week_id,user_id,went_well) values($1,$2,'Saved reflection')",
    [historicalWeek, newcomer],
  )
  await db.exec('set role authenticated')
  assert.deepEqual(
    (await db.query('select id from list_partnerships_for_picker()')).rows,
    [{ id: extra }],
    'review-only history keeps its plan visible',
  )
  assert.equal(
    await scalar('select ensure_workspace()'),
    extra,
    'fresh login defaults to history instead of empty starter',
  )
  assert.equal(
    await scalar('select count(*)::int from partnerships where id=$1', [starter]),
    1,
    'hidden workspace is preserved',
  )
  await db.exec('reset role; set role anon')
  await act('', '')
  for (const sql of [
    'select list_partnerships()',
    'select list_partnerships_for_picker()',
    'select ensure_workspace()',
    "select create_partner_invitation('x@example.com',null)",
    `select invitation_details('${invite.token}')`,
    `select accept_invitation('${invite.token}')`,
    `select cancel_partner_invitation('${invite.token}')`,
  ])
    await assert.rejects(db.query(sql), /permission denied/)
  console.log(
    'PASS: partnership migration preserves history; invitation retry/cancel/recipient checks; no automatic goal transfer; pair isolation; targeted disconnect; notification scoping; anonymous denial.',
  )
} finally {
  await db.close()
}
