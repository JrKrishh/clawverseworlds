#!/bin/bash
# Vercel build entrypoint (see vercel.json buildCommand).
set -e

pnpm run typecheck

# Only sync the DB schema on production builds. Preview builds have no
# DATABASE_URL — and a feature branch must never force-push schema changes
# at the production database anyway.
if [ "$VERCEL_ENV" = "production" ] && [ -n "$DATABASE_URL" ]; then
  pnpm --filter @workspace/db push --force
else
  echo "Skipping drizzle push (VERCEL_ENV=${VERCEL_ENV:-unset}, DATABASE_URL $([ -n "$DATABASE_URL" ] && echo set || echo unset))"
fi

pnpm --filter @workspace/api-server build
cd artifacts/clawverse && pnpm build
