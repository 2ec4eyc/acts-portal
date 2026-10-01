# ACTS Bible School Portal

React + Vite single-page app with a PostgreSQL-backed API on Vercel; Firebase Auth handles sign-in.

## Run locally

Prerequisites: Node.js 22.

```bash
npm install
npm run dev          # http://localhost:3000, uses the real Firebase project
```

Firebase settings come from `VITE_FIREBASE_*` environment variables (see `.env.example`); without them the app falls back to the built-in `acts-bible-school-portal` config.

### Against local emulators and a local database (no real data touched)

Requires Java 11+ for the Firestore emulator.

```bash
npm run emulators          # terminal 1: Firebase Auth + Firestore emulators
npm run db:local           # terminal 2: PostgreSQL 17 on port 5433
npm run seed:local         # terminal 3: test data in the emulators, migrated into Postgres
npm run dev:emulators      # terminal 3: app + API on http://localhost:3000
```

Test logins (password `password123`): `admin@acts.test`, `president@acts.test`, `teacher@acts.test`, `student@acts.test`.

### How the app gets its data

Firebase is used only for sign-in. Pages read and write through `src/lib/data.ts`, which calls the API (`api/index.ts` → `server/routes/`, listed in `docs/API.md`) with the user's Firebase ID token. `src/lib/live.ts` keeps views fresh: it refetches every 30 seconds, when the tab regains focus, and right after any save.

The API reads and writes PostgreSQL; shared server code is in `server/lib/` and `server/db/`.

```bash
npm test                   # API integration tests (needs emulators and db:local running)
```

Schema changes: edit `server/db/schema.ts`, run `npm run db:generate -- --name <change>`, review and commit the SQL in `server/db/migrations/`. Vercel applies it on the next production deploy (`scripts/vercel-build.sh`).

### Moving data from Firebase

`npm run migrate:export` (Firestore to `migration-data/`), then `migrate:load` and `migrate:verify` against the target database. Add `-- --accounts-only` to all three to carry over only the accounts (logins, roles, profiles, student placement) and start with no courses, grades, attendance or files. See the cutover runbook in `docs/ARCHITECTURE_BLUEPRINT.md` §2.4. `migration-data/` holds personal data and is git-ignored.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server (Express + Vite middleware + `/api`, `server.ts`); set `DATABASE_URL` |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | Type-check the app, and the server code under Node's module rules |
| `npm test` | API integration tests (needs `db:local` and `emulators` running) |
| `npm run db:local` / `db:migrate` / `db:generate` / `db:check` | Local Postgres and schema migrations |
| `npm run migrate:export` / `migrate:load` / `migrate:verify` | Firebase to Postgres data migration |
| `npm run db:backup` / `db:restore` / `db:reset` / `admin:grant` | Operations, see below |
| `npm run emulators` / `seed:local` / `dev:emulators` | Local workflow above (`seed:emulators` seeds only the emulators) |

## Operations

The operations scripts use `DATABASE_URL_UNPOOLED` (or `DATABASE_URL`). Against anything other than a local database, they only run with `--yes`.

- **Backups.** Neon keeps a short point-in-time restore history (Neon console → Branches → Restore). For a copy you control, run `npm run db:backup -- --yes` about once a month and before risky changes. It writes `backups/<timestamp>.json`, a full copy including file contents and personal data. Keep it private and never commit it (`backups/` is git-ignored).
- **Restore a backup.** Create an empty database (for example a new Neon branch) and run `npm run db:migrate` until it reaches the backup's migration level. Then run `npm run db:restore -- --file backups/<file>.json --yes`. The restore is a single transaction, and it refuses to write into tables that already have data.
- **Creating admin accounts.** An admin signs in, goes to **Accounts → Add account**, picks role **Admin** and an Admin Category, and sets a temporary password. The new admin signs in with it and changes it under My Profile. Only admins can create admins.
- **Start over (wipe everything).** `npm run db:reset -- --admin-email you@example.com --first Ada --last Admin --yes`, then type `DELETE EVERYTHING` when asked. It saves a backup in `backups/` first, then empties every table (accounts, courses, grades, attendance, files, transcripts, logs) and **deletes every Firebase login**, which can't be undone because Firebase never exports passwords. Finally it creates one admin and prints a link where they choose their password. The schema stays, so the site keeps working. It needs `GOOGLE_APPLICATION_CREDENTIALS` as well as the database URL.
- **Billing.** Admins work in **Billing**: bill students (one invoice each, or a whole batch at once), record office payments, void with a reason, send reminders, and review uploaded receipts. Students see their statement and upload receipts on their own **Billing** page.
  - **Receipt storage.** Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` in Vercel to keep receipts in a private Cloudflare R2 bucket. The bucket needs a CORS rule allowing `PUT` from the portal's address. Without these settings, receipts are stored in the database instead.
  - **Storage limits.** **Settings → Storage** shows how much space receipt files use and lists them. Admins are notified at 7 GB, and new uploads stop at 9 GB, to stay inside R2's 10 GB free tier. Both numbers can be changed there. To free space, delete the files of rejected receipts, or of approved receipts older than the set number of years (default 5). The receipt and payment records stay. Uploads that were started but never submitted are removed automatically after a day.
  - **Daily job.** `vercel.json` schedules `/api/cron/daily` for 06:00 Manila time. It sends due-soon and overdue reminders, removes read notifications older than 180 days, and recounts receipt storage. Set `CRON_SECRET` in Vercel (any long random string), and the job refuses calls that don't carry it.
- **Chat.** Students write to the school office from **Messages**; every admin answers from the same inbox. Messages are stored in the database, and screens check for new ones every few seconds, so no outside service is needed. Turn chat off for students in **Settings → General**.
  - **Yearly archive.** In **Settings → Storage → Chat history**, pick a date (default: one year ago) and choose **Download and archive**. This saves a PDF and a CSV of every message before that date. After checking that the files open, confirm to remove those messages from the portal. **Download only** keeps them.
- **No admin can sign in.** Roles live only in Postgres, so fix it with `npm run admin:grant -- --email someone@example.com --yes`. This makes the account an active admin and logs the change in `audit_log`. If the person has a Firebase login but no portal account, the script creates the account; that case needs `GOOGLE_APPLICATION_CREDENTIALS`.
- **A bad deploy.** In Vercel, go to Deployments, open the previous Production deployment and choose **Instant Rollback**. Database migrations are additive, so the previous version still works.
- **Uptime.** `GET /api/health` returns `{"ok":true}` when the API can reach the database. Point a free uptime monitor at it (for example UptimeRobot). Errors are logged in Vercel → Logs.
- **Firebase Auth settings.** In Authentication → Settings, turn off public sign-up (admins create accounts) and turn on email enumeration protection.

## Project layout

```
src/
  main.tsx            entry point
  App.tsx             auth/session handling, sidebar, page routing
  pages/              one component per sidebar page
  components/         shared UI; components/modals/ for dialogs
  lib/                firebase setup, formatting, GPA, image and error helpers
  types.ts            shared data types
  constants.ts
api/index.ts          the single Vercel Function for /api/*
server/               routes/ (API handlers + route table), lib/ (auth, db, services), db/ (schema, migrations)
scripts/migrate/      Firebase to Postgres export, transform, load, verify
tests/                API integration tests
firestore.rules       security rules (publish via Firebase console or `firebase deploy --only firestore:rules`)
docs/ARCHITECTURE_BLUEPRINT.md   review and PostgreSQL/Vercel migration plan
```
