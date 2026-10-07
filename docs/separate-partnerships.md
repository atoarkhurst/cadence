# Separate partnerships and invitations

## Product contract

- One login, multiple independent two-person partnerships. No groups.
- Each partnership owns its goals, progress, week schedule, reviews, and encouragement.
- The picker changes Today and This week together. A switch from Today stays on Today; a switch from a historical or settings page opens the selected partnership's current week.
- Display name, authentication, and device notification preferences remain account-wide.
- The encouragement inbox is account-wide. Each note's week link carries its partnership ID, so following a notification cannot accidentally open another partner's week.
- Creating an invitation does **not** send email. The sender shares a link or the recipient finds it in Invitations. Authentication emails remain a separate Supabase flow.
- The new-partner page always creates a separate plan. Inviting from an existing solo week's form explicitly shares that solo plan. Neither operation imports the recipient's goals.
- Accepted invitations select the new partnership for the recipient. The sender sees an accepted state and an Open partnership link; the app does not interrupt their current work by switching automatically.
- A backup account is still a separate identity. No account or history merging is included.

## Code map

- `active-partnership.js`: account-scoped preference, subscription, UUID validation. Only the selected ID is persisted.
- `PartnershipPicker.jsx`: partnership list and navigation; access is never inferred from a stored preference.
- `cadence.js`: validates membership before loading the selected plan, and calls invitation functions.
- `week-store.js`: session-only cache entries include partnership and week. Switching invalidates entries so late responses cannot paint another partner's data.
- `Partners.jsx`: separate-plan invitation creation, persistent outgoing invitations, native sharing/copy fallback, cancellation confirmation, and incoming invitations.
- `Invite.jsx` and `Auth.jsx`: token-preserving sign-in, recipient-scoped sender lookup, wrong-account recovery, expiration and acceptance.
- Migration 013: checked creation/cancellation/acceptance, two-person membership, duplicate-pair rejection, targeted disconnection, and narrowed write grants. Migration 016 adds a duplicate-pair deployment guard and plan-aware invitation retries.

## Security boundaries

The browser preference is untrusted. Every load checks membership and every database mutation is still protected by row-level security or explicit checks in a security-definer function. Function search paths are empty, anonymous execution is revoked, and direct membership/invitation writes are revoked. Sender identity comes from the authenticated session, never a form field.

Acceptance locks the two profiles in UUID order, then the invitation and partnership. Repeated acceptance returns the same partnership. Reciprocal acceptance cannot create two new connections for the same pair. PostgreSQL may abort a conflicting transaction rather than complete it; the UI must surface errors and permit retry, not pretend success.

New invitations retain the existing ten-per-hour quota and allow up to five pending separate-plan invitations per sender. An explicit retry for the same solo plan reuses its token. An ambiguous new-plan retry or a request for a different plan reports the pending-invitation conflict instead of returning a link for the wrong plan. Sender names are disclosed by token lookup only to the invited signed-in account, not to anonymous visitors. Tokens must not be included in analytics or application logs.

Migration 013 does not rewrite existing business rows. Accepting no longer moves goals out of any existing workspace. Disconnecting explicitly moves only that pair's own goals into new private workspaces, retaining goal/progress IDs and schedules; it never reuses another private or shared plan. Shared messages/reviews remain stored but inaccessible after disconnection, matching the confirmation copy.

## Controlled production rollout — not yet applied

1. Run `npm run check`. The PGlite permission suite applies migrations 013–016 twice and checks unchanged existing goals, duplicate-pair rejection, invitation plan conflicts, targeted disconnection, and personal-plan fallback. React tests include navigation plus picker recovery from a stale URL and invitation acceptance without browser storage.
2. Confirm a restorable production backup/export. Run the read-only `supabase/preflight/20261006_pair_health.sql` against production before migration 013. Both result sets must be empty: no oversized memberships and no duplicate active two-person pairs. Stop and investigate any rows; do not repair, merge, or delete records implicitly.
3. Use the separate Supabase staging project with test accounts A, B, and C. Migrations 013–015 are already applied there; apply 016 and repeat the affected invitation flows before production. Earlier flows are recorded in `docs/staging-test-results.md`. PGlite does not validate hosted PostgREST result shapes, actual email redirect allowlists, concurrent connections, or phone delivery.
4. Keep the validated frontend build ready. Apply only pending migrations 013, 014, 015, then 016 to production in filename order, one complete migration at a time, then publish that build. Do not run the old hardening rollout script against these migrations. Verify each migration finished successfully before proceeding; do not replay any migration already applied to production.
5. Old tabs can still read, but their direct invitation creation is intentionally denied after migration. Ask testers to refresh. Do not restore unsafe write grants as a rollback.
6. Verify A/B history before and after A/C acceptance; pending invitations survive refresh; wrong-email, cancelled, expired, and duplicate invites fail clearly; both Today and Week use the chosen pair; a note from C opens the A/C week while A has B selected; unlinking A/C leaves A/B untouched.
7. Check mobile menu layout, share-sheet cancellation, manual copy fallback, password and email-link sign-in, and refresh after accepting from another browser. Never use Ato/Joey's real partnership for destructive tests.

If rollout fails, keep the safer database permissions and fix forward with a compatible frontend or a new migration. Do not replay historical migrations: older acceptance functions relocate solo goals and are incompatible with separate partnerships.

## Known follow-ups

- Isolated database tests are not a concurrent hosted PostgreSQL test. Exercise reciprocal invitations and disconnect/accept races on the staging project before production.
- Multiple private workspaces may remain from past disconnections or cancelled invitations. They are deliberately retained rather than automatically merged/deleted; a future explicit archive/naming control can improve this without risking history.
- Signup email delivery limits and push delivery latency are unchanged.
