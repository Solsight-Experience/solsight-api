#!/usr/bin/env bash
set -euo pipefail

if rg --multiline --multiline-dotall \
    '@InjectRepository\(\s*(Token|OhlcCandle|Category|Transaction|SwapTrade|WalletSnapshot|MarketPriceEvent)\s*\)' \
    solsight-api/src/; then
  echo "FAIL: @InjectRepository found for partitioned entity above" >&2
  exit 1
fi
echo "OK: no @InjectRepository for partitioned entities"
exit 0
