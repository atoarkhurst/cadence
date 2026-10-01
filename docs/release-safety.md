# Release safety

## Routine release

1. Use a clean branch or inspect existing edits before changing files.
2. Run `npm ci`, `npm run check`, and `npm audit`. Review dependency changes; avoid forced major upgrades.
3. For a database change, test all migrations on an isolated database and exercise denial cases. Never alter an already-applied migration.
4. Confirm a restorable database backup/export before migrations that rewrite or remove data. Test restoration to a separate project; a backup is not verified just because a file exists.
5. Apply additive, compatible database changes, then publish the frontend. Verify public routes and test-account workflows. Avoid using Joey's account for test writes.

## October 2026 hardening rollout

Migrations 009–011 restrict unsafe permissions, add scoped functions, add an empty correction ledger, and add creation limits. They do not delete or rewrite existing business records.

`scripts/apply-hardening.mjs` is deliberately scoped to these three migrations. Supply `SUPABASE_PROJECT_REF` and `SUPABASE_ACCESS_TOKEN`, or a `SUPABASE_TOKEN_FILE` path. Never commit credentials. Run without arguments for preflight, then with `--apply` for the explicit rollout.

The script:

- Rejects existing cross-partnership week links instead of trying to silently repair them.
- Applies pending migrations in one transaction with lock and statement timeouts.
- Briefly locks existing public tables and compares full-row fingerprints before and after. Any unexpected change rolls back the transaction.
- Records checksums in a restricted `cadence_private.schema_migrations` ledger; edited applied migrations fail verification.
- Refreshes PostgREST's schema cache.

The fingerprint check is a preservation guard, not a disaster-recovery backup. Do not use this rollout script for arbitrary future migrations. Earlier manually applied migrations are not falsely recorded as having been deployed through this script.

After migration 010, old open tabs cannot write directly to the old progress table. Publish the new frontend promptly and ask testers to refresh. If publishing fails, keep the safer permissions and fix forward; do not restore vulnerable grants to keep old clients working.

## Rollback and incident response

- A failed database transaction rolls back automatically. Inspect the cause before retrying.
- After a successful migration, prefer a new corrective migration. Preserve the new ledger and original rows.
- Reverting the frontend to a pre-010 build is not a complete rollback: that build lacks the correction ledger and its writer. Keep a tested compatible frontend available.
- If needed, pause new writes or notifications while investigating. Do not delete history or rotate push keys as a troubleshooting shortcut.
- Monitor failed push jobs and authentication failures. Do not log message content, subscription endpoints, or access tokens.

## Manual acceptance with two test accounts

Verify invitation creation/acceptance, both dashboards after refresh, same-day and next-day progress corrections, encouragement delivery, password-reset email handling, review carry-forward, and unlinking. Check phone and desktop layouts. Automated checks complement this; they do not certify every hosted integration.
