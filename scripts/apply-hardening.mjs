// Explicitly scoped rollout: metadata-only migrations plus a new empty ledger.
// Defaults to preflight. Credentials are never printed or included in the repo.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const project = process.env.SUPABASE_PROJECT_REF
const token =
  process.env.SUPABASE_ACCESS_TOKEN ||
  (process.env.SUPABASE_TOKEN_FILE
    ? (await readFile(process.env.SUPABASE_TOKEN_FILE, 'utf8')).trim()
    : '')
if (!/^[a-z]{20}$/.test(project || '') || !token)
  throw new Error('Set SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN (or SUPABASE_TOKEN_FILE).')
const files = [
  '202610010009_access_hardening.sql',
  '202610010010_progress_corrections.sql',
  '202610010011_creation_limits.sql',
  '202610010012_encouragement_hearts.sql',
]
const migrations = await Promise.all(
  files.map(async (file) => {
    const sql = await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8')
    return {
      file,
      sql: sql.replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, ''),
      hash: createHash('sha256').update(sql).digest('hex'),
    }
  }),
)
async function query(sql, readOnly = true) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  })
  if (!response.ok)
    throw new Error(
      `Database request failed (${response.status}); inspect the database error privately before retrying.`,
    )
  return response.json()
}
const preflight = await query(`select
 (select count(*) from public.weeks w join public.weeks n on n.id=w.next_week_id where w.partnership_id<>n.partnership_id)::int as invalid_week_links,
 (select count(*) from public.intentions)::int as intentions,
 (select count(*) from public.progress_entries)::int as progress_entries,
 to_regclass('cadence_private.schema_migrations')::text as ledger;`)
if (preflight[0].invalid_week_links)
  throw new Error('Existing week links need manual review; nothing has been changed.')
const recorded = preflight[0].ledger
  ? await query('select version,checksum from cadence_private.schema_migrations')
  : []
for (const migration of migrations) {
  const previous = recorded.find((row) => row.version === migration.file)
  if (previous && previous.checksum !== migration.hash)
    throw new Error('An applied migration was edited. Add a new migration instead.')
}
const pending = migrations.filter((item) => !recorded.some((row) => row.version === item.file))
console.log({ project, preflight: preflight[0], pending: pending.map((item) => item.file) })
if (!process.argv.includes('--apply') || !pending.length) process.exit(0)

// Compare every existing public table, not just totals. A difference aborts the
// same transaction. This is a preservation guard, not a replacement for backups.
const fingerprint = `do $$ declare t record; digest text; begin
 for t in select tablename from pg_tables where schemaname='public' order by tablename loop
  execute format('select md5(coalesce(string_agg(md5(row_to_json(x)::text), %L order by md5(row_to_json(x)::text)), %L)) from public.%I x', '', '', t.tablename) into digest;
  insert into cadence_before values(t.tablename,digest);
 end loop;
end $$;`
const verify = `do $$ declare t record; digest text; begin
 for t in select * from cadence_before loop
  execute format('select md5(coalesce(string_agg(md5(row_to_json(x)::text), %L order by md5(row_to_json(x)::text)), %L)) from public.%I x', '', '', t.table_name) into digest;
  if digest is distinct from t.digest then raise exception 'History changed unexpectedly in %; migration rolled back.',t.table_name; end if;
 end loop;
end $$;`
await query(
  `begin;
 set local lock_timeout='10s';
 set local statement_timeout='60s';
 -- Block concurrent writes briefly so the before/after comparison is meaningful.
 do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='public' order by tablename loop execute format('lock table public.%I in share row exclusive mode',t.tablename); end loop; end $$;
 create temp table cadence_before(table_name text,digest text) on commit drop;
 ${fingerprint}
 create schema if not exists cadence_private;
 revoke all on schema cadence_private from public,anon,authenticated;
 create table if not exists cadence_private.schema_migrations(version text primary key,checksum text not null,applied_at timestamptz not null default now());
 ${pending.map((item) => item.sql + `\ninsert into cadence_private.schema_migrations(version,checksum) values('${item.file}','${item.hash}');`).join('\n')}
 ${verify}
 notify pgrst,'reload schema';
 commit;`,
  false,
)
console.log(
  'Applied successfully. All pre-existing public rows are unchanged; migration checksums recorded.',
)
