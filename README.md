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
| `npm run emulators` / `seed:local` / `dev:emulators` | Local workflow above (`seed:emulators` seeds only the emulators) |

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
