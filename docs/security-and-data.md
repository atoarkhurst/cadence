# Security and data rules

## Ownership

Partners can read shared intentions, progress, notes, and reviews. Only the owner can change their intentions or progress; only an author can delete their note. Week dates and rollover links are server-managed. The database enforces these rules independently of the UI.

Profiles are readable by their owner and current partners. Pending invitations expose only the sender information needed to accept, through a recipient-scoped function. Disconnecting removes access to the former partner's records; it preserves each person's goals and progress.

## Progress corrections

Existing `progress_entries` are not rewritten by the hardening migration. New saves append signed `progress_adjustments`. The displayed total is the sum of both tables. A correction of -1 can undo a completion recorded yesterday without deleting that original record.

`set_intention_progress` checks the current account, goal ownership, membership, requested value, expected previous total, and operation UUID. A stale total produces an explicit conflict instead of overwriting another device's change. Reusing the same operation UUID and parameters is idempotent. The recording date uses the partnership timezone, with UTC as the documented fallback when no schedule exists; date boundaries do not affect correctness of the total.

The frontend reloads after save success or failure. Today and This week refresh on focus/visibility and every 15 seconds while visible. This is polling, not instant realtime synchronization.

## Database function boundaries

Security-definer functions run with elevated privileges and must explicitly validate the caller and related records. A function parameter or stored foreign key is not trustworthy merely because it is a UUID. The composite next-week constraint guarantees that rollover links stay in the same partnership, including inside privileged functions.

The first-use workspace function serializes on the user's profile. It returns the same selected workspace when multiple components or tabs initialize together.

## Abuse limits

The database limits invitation creation to 10 per account per hour and encouragement to 12 per minute / 200 per day. Creation timestamps are server-owned. These limits reduce ordinary repeated submissions; they are not a complete defense against coordinated multi-account abuse. Public signup still needs an operational abuse review before broad promotion.

## Credentials and exports

- A publishable Supabase key is expected in the frontend; protection comes from authentication, grants, and row-level security.
- Service-role keys, VAPID private keys, and dispatch secrets must stay server-side.
- Environment files are ignored except `.env.example`. Do not put real secrets into examples, screenshots, test fixtures, or commits.
- Share links contain encoded, not encrypted, snapshots. A confirmation explains that they are public, permanent copies. Snapshot shape and size are validated before rendering.
- Push notifications contain no goal titles or private message text. The service worker does not cache private account data.

## Tests to preserve

Run permission tests as owner, partner, unrelated account, former partner, and anonymous—not only as the database administrator. Cover delete and ownership changes as well as reads. Keep regressions for foreign rollover destinations, yesterday's undo, conflicting saves, retries, migration reruns, and history preservation.

The isolated PGlite suite covers PostgreSQL functions and policy behavior, not every hosted Supabase/PostgREST behavior. React tests do not prove real email or phone delivery. Keep a separate two-test-account acceptance pass for those integrations.
