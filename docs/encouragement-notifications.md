# Encouragement notifications: rollout and operations

## What is included

- A private encouragement inbox and unread count in the header, on desktop and mobile.
- Notes remain under the recipient's weekly goals. A note becomes read after it is at least half visible for 1.2 seconds in an active tab, or after choosing **Mark as read**. Read state follows the account across devices; senders cannot read these receipts.
- Existing messages remain untouched and do not generate retroactive alerts.
- Optional, per-device Web Push for **encouragement only**. No goal completion alerts or message text on the lock screen.
- Home Screen installation metadata and icons. This does **not** add offline editing or cache private account data.

## Required setup (not performed by deploying GitHub Pages)

The frontend degrades safely while setup is incomplete. Existing messaging still works. The inbox explains when its database update is missing; notification settings do not request permission until the server reports that push is enabled.

1. Apply `supabase/migrations/202609290008_encouragement_notifications.sql` once in the Supabase SQL Editor, after migration 007. It is additive and rerunnable. Do not rerun old migrations. It creates private notification, device subscription, and delivery-queue tables, plus restricted functions and an insert trigger. It does not delete or rewrite goals, progress, reviews, messages, or memberships.
2. Deploy the function with your authenticated Supabase CLI:

   ```sh
   supabase functions deploy encouragement-push --project-ref aiiigbmumamuqlpxssem
   ```

   The repository's function configuration disables gateway JWT verification because the handler explicitly verifies the user's JWT for browser requests and a separate secret for dispatch. Do not remove these handler checks.

3. Generate one VAPID key pair with the maintained `web-push` utility (`npx web-push generate-vapid-keys`) and a separate high-entropy dispatch secret (at least 32 random bytes). Keep the private key and dispatch secret out of Git, frontend environment variables, and screenshots. Keep the key pair stable; rotating it requires devices to resubscribe.
4. In Supabase **Edge Functions → Secrets**, set:

   | Secret                 | Value                                                    |
   | ---------------------- | -------------------------------------------------------- |
   | `VAPID_PUBLIC_KEY`     | Generated public key                                     |
   | `VAPID_PRIVATE_KEY`    | Generated private key                                    |
   | `VAPID_SUBJECT`        | A real maintainer contact, such as `mailto:your-address` |
   | `PUSH_DISPATCH_SECRET` | The separate random dispatch secret                      |
   | `APP_ORIGIN`           | `https://atoarkhurst.github.io` (no `/cadence` path)     |
   | `PUSH_ENABLED`         | Start with `false`; change to `true` after scheduling    |

   Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function. Never put the service-role key in a `VITE_` variable. The browser receives only the public VAPID key after signing in.

5. Enable Supabase Cron and pg_net, store the dispatch secret in Supabase Vault named `cadence_push_dispatch_secret`, and schedule the following job **once**. Use the same secret as in step 4. Do not store the literal secret in the cron command. Verify `cadence-encouragement-push` does not already exist before creating it.

   ```sql
   select cron.schedule(
     'cadence-encouragement-push',
     '* * * * *',
     $$select net.http_post(
       url := 'https://aiiigbmumamuqlpxssem.supabase.co/functions/v1/encouragement-push',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets
           where name = 'cadence_push_dispatch_secret' limit 1)
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 30000
     );$$
   );
   ```

6. Change `PUSH_ENABLED` to `true`. Confirm Cron runs and the function returns HTTP 200 before enabling a phone. A newly sent note should normally be picked up within about a minute, not instantly. Authentication email limits do not apply to Web Push; service usage and browser delivery limits still apply.

## Two-account acceptance test before calling push live

Use test accounts, not fabricated activity in Joey's account.

1. With push off, send one note from A to B. B sees an unread count within the 15-second refresh interval or on returning to the app. Do not scroll to the note yet: it must remain unread. Scroll to it; it should become read and the count should update. Reload or use B on another device to verify saved read state.
2. Send a new note, leave B's app closed, and verify that **no push** arrives before opting in.
3. On an iPhone with iOS 16.4+, add Cadence to the Home Screen, open that icon, sign in, and enable notifications in Account. Test Chromium/Firefox separately when available. This initial version accepts Apple, Google FCM, and Mozilla push endpoints; other providers fail safely with an explanation.
4. Send one new note from A. B should receive the generic notification. Tap it: the private inbox opens and the requested note scrolls into view. If signed out, sign in, then open the header note icon. No message or goal details should appear on the lock screen.
5. Read a note before dispatch: its queued push should be skipped. Send two different notes and verify each is handled; repeated worker calls must not claim the same live lease.
6. Turn off notifications, send another note, and verify it remains available in-app without a push. Reenable, sign out, and verify this device unsubscribes. Signing in as a different account must not inherit the previous account's subscription.
7. With test accounts only, queue a note then unlink the partnership before dispatch. It must be skipped and the former recipient's inbox must no longer expose that connection's notes.
8. Deny permission and test an unsupported browser: in-app encouragement must remain usable. Test offline/server-error states without losing a typed note.

## Delivery and privacy boundaries

- Queue insertion is transactional with message creation; eligible device subscriptions are captured at that time. Enabling notifications does not replay old notes.
- A worker claims at most 20 jobs with five-minute leases, rechecks current membership, unread status and subscription ownership, and retries temporary failures up to five attempts. Notes older than an hour are skipped; a push already accepted by a browser service expires after five minutes.
- Network delivery is **not exactly-once**. If delivery succeeds but recording success fails, a retry is possible. A stable notification tag with `renotify: false` replaces the same displayed notification rather than deliberately making another alert. OS behavior and Focus settings can affect delivery.
- Unsubscribing deletes queued work for that device. Unlinking removes access and stops future eligible sends. Already delivered or in-flight OS notifications cannot always be recalled; their content is deliberately generic.
- Outbound endpoints are restricted to known push providers and redirects are rejected. Browser clients cannot read other users' device keys, enqueue arbitrary deliveries, claim jobs, or impersonate a recipient.
- Private notes are fetched only after normal Supabase authentication and row-level security checks. The service worker has no auth token and no cache of private messages.

## Monitoring / rollback

Inspect `encouragement_push_queue` in Supabase for `failed` jobs and Cron/Edge Function logs for errors. Do not log full subscription URLs, keys, or note content. A backlog consistently above 20 new deliveries/minute needs a deliberate throughput review before public launch.

To pause push, set `PUSH_ENABLED=false` and pause the named Cron job. Leave the additive tables in place so unread state and history remain safe. To remove the frontend feature, revert its Git commit, not the existing database history. Pending pushes older than an hour will not be sent when resumed.

References: [WebKit iPhone web push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions), [web-push library](https://github.com/web-push-libs/web-push).
