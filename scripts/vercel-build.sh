#!/usr/bin/env bash
# Vercel build: apply database migrations, then build the app.
#
# Production deploys migrate whenever a database is configured. Preview deploys migrate only when
# MIGRATE_ON_PREVIEW=true is set for the Preview environment: turn that on only once each preview
# gets its own Neon branch, otherwise previews would apply unmerged migrations to production data.
set -euo pipefail

DB_URL="${DATABASE_URL_UNPOOLED:-${DATABASE_URL:-}}"

if [[ -z "$DB_URL" ]]; then
  echo "No database configured; skipping migrations."
elif [[ "${VERCEL_ENV:-}" == "production" || ( "${VERCEL_ENV:-}" == "preview" && "${MIGRATE_ON_PREVIEW:-}" == "true" ) ]]; then
  echo "Applying database migrations ($VERCEL_ENV)..."
  npx drizzle-kit migrate
else
  echo "Skipping migrations for VERCEL_ENV=${VERCEL_ENV:-unset}."
fi

npx vite build
