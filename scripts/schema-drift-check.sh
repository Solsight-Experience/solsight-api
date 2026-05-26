#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://postgres:password@localhost:5432/flaxh_trade}"

echo "Dumping mainnet schema..."
pg_dump --schema-only --no-owner --no-acl -n mainnet "$DATABASE_URL" > /tmp/main.sql

echo "Dumping devnet schema..."
pg_dump --schema-only --no-owner --no-acl -n devnet "$DATABASE_URL" > /tmp/dev.sql

echo "Normalizing schema names for comparison..."
sed -i 's/"mainnet"\."/<schema>./g' /tmp/main.sql
sed -i 's/"devnet"\."/<schema>./g' /tmp/dev.sql

if diff -u /tmp/main.sql /tmp/dev.sql > /dev/null; then
  echo "✓ Schema drift check passed: mainnet and devnet schemas are identical"
  exit 0
else
  echo "✗ Schema drift detected! Diff:"
  diff -u /tmp/main.sql /tmp/dev.sql || true
  exit 1
fi
