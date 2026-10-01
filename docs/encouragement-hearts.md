# Encouragement hearts

A recipient can acknowledge a note from the weekly view or encouragement inbox.
The recipient sees a quiet heart button below the note; the sender sees a small
heart beside “You” on the sent note. Tapping again removes the heart. Both icons
have descriptive labels for assistive technology. Hearts do not send push
notifications or change unread markers.

## How it works

- `EncouragementHeart` handles pending/error UI; the shared data module calls
  `set_encouragement_heart` with an explicit desired state, making retries safe.
- The separate `encouragement_reactions` table leaves messages and progress intact.
- Only the current recipient can write, through the database function. Partners
  can read their connection’s hearts; outsiders and disconnected partners cannot.
- Existing refresh-on-focus and polling update the sender’s weekly view. This is
  not an instant push delivery guarantee.

## Release and acceptance

Apply migration `202610010012_encouragement_hearts.sql` before deploying the UI.
The reviewed rollout script includes it and verifies pre-existing rows are unchanged.
`npm run check` tests permissions, retries, undo, unlinking, notification counts,
pending controls, and failures.

With two test accounts, send a note, heart it as the recipient, and confirm the
sender’s receipt appears after refresh. Undo it and repeat from the inbox. Neither
heart action should create a phone alert. Do not alter the main partnership for testing.
