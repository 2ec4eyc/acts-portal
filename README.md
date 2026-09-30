# ACTS Bible School Portal

React + Vite single-page app backed by Firebase (Auth + Firestore), deployed on Vercel.

## Run locally

Prerequisites: Node.js 22.

```bash
npm install
npm run dev          # http://localhost:3000, uses the real Firebase project
```

Firebase settings come from `VITE_FIREBASE_*` environment variables (see `.env.example`); without them the app falls back to the built-in `acts-bible-school-portal` config.

### Against local emulators (no real data touched)

Requires Java 11+ for the Firestore emulator.

```bash
npm run emulators          # terminal 1: Auth + Firestore emulators with firestore.rules
npm run seed:emulators     # terminal 2: test data, one account per role
npm run dev:emulators      # terminal 2: app on http://localhost:3000
```

Test logins (password `password123`): `admin@acts.test`, `president@acts.test`, `teacher@acts.test`, `student@acts.test`.

### API and database (Phase 2, in progress)

The API lives in `api/` (Vercel Functions, listed in `docs/API.md`) with shared server code in `server/`. It reads and writes PostgreSQL and checks the caller's Firebase login. The app doesn't use it yet; it switches over at the planned cutover.

```bash
npm run db:local           # terminal 1: local PostgreSQL 17 on port 5433
npm run emulators          # terminal 2: Firebase emulators
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/acts
npm run db:migrate         # create the tables
npm test                   # seeds emulators, migrates them into Postgres, tests the API
```

`npm run dev` also serves `/api/*` locally (set `DATABASE_URL`, and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` for emulator logins).

Schema changes: edit `server/db/schema.ts`, run `npm run db:generate -- --name <change>`, review and commit the SQL in `server/db/migrations/`. Vercel applies it on the next production deploy (`scripts/vercel-build.sh`).

### Moving data from Firebase

`npm run migrate:export` (Firestore to `migration-data/`), then `migrate:load` and `migrate:verify` against the target database. See the cutover runbook in `docs/ARCHITECTURE_BLUEPRINT.md` §2.4. `migration-data/` holds personal data and is git-ignored.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server (Express + Vite middleware, `server.ts`) |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | Type-check the app, and the server code under Node's module rules |
| `npm test` | API integration tests (needs `db:local` and `emulators` running) |
| `npm run db:local` / `db:migrate` / `db:generate` / `db:check` | Local Postgres and schema migrations |
| `npm run migrate:export` / `migrate:load` / `migrate:verify` | Firebase to Postgres data migration |
| `npm run emulators` / `seed:emulators` / `dev:emulators` | Local emulator workflow above |

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
api/                  Vercel Functions (HTTP API)
server/               API code shared by the functions: db/ (schema, migrations), lib/ (auth, db, profiles)
scripts/migrate/      Firebase to Postgres export, transform, load, verify
tests/                API integration tests
firestore.rules       security rules (publish via Firebase console or `firebase deploy --only firestore:rules`)
docs/ARCHITECTURE_BLUEPRINT.md   review and PostgreSQL/Vercel migration plan
```
