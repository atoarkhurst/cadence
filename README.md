# Cadence

Cadence is a private weekly accountability ritual for two people: choose a few intentions, track progress, send encouragement, and reflect together.

## Architecture

- **React + React Router** render Today, This week, reviews, account settings, and the encouragement inbox.
- **Supabase Auth** identifies users. The browser uses a publishable key; it is not an administrator credential.
- **PostgreSQL row-level security** controls which records an account can read or change, even if someone bypasses the UI.
- **Database functions** handle transactions: first-use setup, invitations, progress corrections, review rollover, and unlinking.
- **One Edge Function + a scheduled queue** deliver optional generic Web Push notifications.
- **GitHub Pages** hosts the compiled frontend. It does not host the database or send authentication email.

No private goals or messages are cached for offline use. Shared snapshot URLs are a separate public export: anyone with a link can read it, and it cannot be revoked.

## Local setup

Use Node 22 and npm. Copy `.env.example` to `.env.local` and supply a development Supabase project's URL and publishable key. Never use a service-role key in a `VITE_` variable.

```sh
npm ci
npm run dev
```

The app uses `/cadence/` as its base path. The development database needs all migrations in filename order. Initial migrations are not generally rerunnable; keep a migration ledger and apply only pending files. Do not test destructive behavior against real accounts.

## Checks and releases

```sh
npm run format
npm run check
npm audit
```

`check` runs lint, formatting checks, logic tests, isolated database tests, React interaction tests, and a production build. GitHub Actions runs these on pushes and pull requests. Dependency audit results are warnings to investigate, not proof that every reported issue affects this deployment.

`npm run deploy` checks the project, builds it, and publishes to GitHub Pages. It does **not** apply database migrations or deploy the push function. Apply compatible database changes before publishing a frontend that requires them. See [release safety](docs/release-safety.md).

## Find your way around

| Location                                 | Responsibility                                                     |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `src/main.jsx`, `src/Root.jsx`           | Routes and shared navigation                                       |
| `src/App.jsx`, `src/Week.jsx`            | Daily and weekly screen composition                                |
| `src/hooks/useWeek.js`                   | Shared loading, refresh, save lifecycle, stale-response protection |
| `src/lib/cadence.js`                     | Database reads and domain actions                                  |
| `src/Review.jsx`                         | Weekly reflection and next-week planning                           |
| `src/Auth.jsx`, account components       | Sign-in, recovery, profile, partner, notification settings         |
| `src/EncouragementProvider.jsx`          | Inbox loading, unread state, account isolation                     |
| `supabase/migrations/`                   | Versioned schema, permissions, transactional functions             |
| `supabase/functions/encouragement-push/` | Server-only delivery                                               |
| `scripts/test-*.mjs`                     | Isolated database and service-worker regression tests              |
| `src/**/*.ui.test.jsx`                   | React behavior tests, not real email/browser delivery tests        |

## Learn by tracing one goal update

1. The user clicks a checkbox in `App.jsx` or `Week.jsx`.
2. `useWeek.saveChange` marks the screen busy and invalidates older reads.
3. `setProgress` calls `set_intention_progress` with the intended total, last-seen total, and a unique request ID.
4. PostgreSQL verifies ownership and membership, locks the goal, checks for concurrent edits, and appends a correction.
5. The hook reloads server truth. Both screens read the same original entries plus corrections.

This separation matters: React displays state; the data module describes requests; PostgreSQL enforces authorization and consistency. Hidden buttons are not a security boundary.

## Working agreements

- Keep new JSX and CSS readable; run the formatter rather than compressing code.
- Put shared request lifecycle logic in hooks, not copied into multiple screens.
- Test the failure and denial cases, not only successful actions.
- Never edit a migration that has already been applied. Add a new one.
- Preserve IDs/history when changing data models; do not reset production to make a test pass.
- Add a short explanation for non-obvious business rules.
- Keep changes small: formatting, behavior, and database deployment should be independently reviewable.
- Introduce TypeScript incrementally if it helps; a rewrite is not required.

See [security and data rules](docs/security-and-data.md) and [notification operations](docs/encouragement-notifications.md).
