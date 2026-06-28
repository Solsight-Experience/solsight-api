#!/usr/bin/env bash

set -euo pipefail

matches="$(rg -n 'TOKEN_PRICE_LATEST' src || true)"

if [ -z "$matches" ]; then
    exit 0
fi

violations="$(printf '%s\n' "$matches" | grep -vE '^(src/redis/services/redis\.service\.ts|src/modules/tokens/services/token-price\.service\.ts):' || true)"

if [ -n "$violations" ]; then
    echo 'TOKEN_PRICE_LATEST may only be referenced from RedisService or TokenPriceService.'
    printf '%s\n' "$violations"
    exit 1
fi
