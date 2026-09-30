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

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server (Express + Vite middleware, `server.ts`) |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | Type-check (`tsc --noEmit`) |
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
firestore.rules       security rules (publish via Firebase console or `firebase deploy --only firestore:rules`)
docs/ARCHITECTURE_BLUEPRINT.md   review and PostgreSQL/Vercel migration plan
```
