#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://postgres:password@localhost:5432/flaxh_trade}"

echo "Dropping existing schemas..."
psql "$DATABASE_URL" -c "DROP SCHEMA IF EXISTS mainnet CASCADE;" || true
psql "$DATABASE_URL" -c "DROP SCHEMA IF EXISTS devnet CASCADE;" || true
psql "$DATABASE_URL" -c "DROP SCHEMA IF EXISTS public CASCADE;" || true
psql "$DATABASE_URL" -c "CREATE SCHEMA public;" || true

echo "Running migrations..."
pnpm run migration:run

echo "Seeding devnet tokens..."
pnpm run seed:devnet

echo "✓ Schemas reset, migrated, and seeded successfully"
