# Phase 5 Service Migration Checklist

## Completed ✅
- [x] **TokensService** (`src/modules/tokens/services/tokens.service.ts`)
  - Removed @InjectRepository for Token, OhlcCandle  
  - Added DataSourceRegistry + ClusterProvider
  - Created getTokenRepository() and getOhlcCandleRepository() helpers
  - Updated all repository calls
  - Build: PASSING

## Remaining (6 services) - ATOMIC REQUIREMENT

These MUST all be completed and in a single PR:

### 1. TokenSummaryService
**File**: `src/modules/tokens/services/token-summary.service.ts`  
**Entities**: Token  
**Pattern**:
- Remove: `@InjectRepository(Token)`  
- Add: `DataSourceRegistry`, `ClusterProvider` to constructor
- Update: All `this.tokenRepository` → `await this.getTokenRepository()`

### 2. TokenSeederService  
**File**: `src/modules/tokens/services/token-seeder.service.ts`  
**Entities**: Token, Category  
**Pattern**: Same as TokenSummaryService (2 repositories)

### 3. TransactionsService  
**File**: `src/modules/transactions/services/transactions.service.ts`  
**Entities**: Transaction  
**Pattern**: Same pattern (1 repository)

### 4. PortfolioService  
**File**: `src/modules/portfolio/services/portfolio.service.ts`  
**Entities**: SwapTrade, WalletSnapshot  
**Pattern**: Same pattern (2 repositories)

### 5. DiscoveryService  
**File**: `src/modules/discovery/services/discovery.service.ts`  
**Entities**: Token, OhlcCandle  
**Pattern**: Same pattern (2 repositories)

### 6. StreamConsumerService  
**File**: `src/modules/indexer/services/stream-consumer.service.ts`  
**Entities**: MarketPriceEvent  
**Pattern**: Same pattern (1 repository)  
**Note**: Per spec, stream-consumer writes to mainnet only (devnet deferred). Ensure cluster routing is correct.

## Verification Checklist

After all 7 services are migrated:

- [ ] Build passes: `pnpm run build`
- [ ] Lint passes: `pnpm run lint`
- [ ] Type check passes: no TypeScript errors
- [ ] Grep gate passes: `bash scripts/check-no-injectrepository-partitioned.sh`
- [ ] All tests pass: `pnpm run test`

## Success Criteria for Phase 5

All the following MUST be true for Phase 5 to be considered complete:

1. **All 7 services migrated** - TokensService, TokenSummaryService, TokenSeederService, TransactionsService, PortfolioService, DiscoveryService, StreamConsumerService
2. **No @InjectRepository on partitioned entities** - Verified by grep gate
3. **Build passing** - `pnpm run build` exits 0
4. **Lint passing** - `pnpm run lint` exits 0
5. **Tests passing** - Existing tests still pass
6. **DataSourceRegistry injection** - All chain-data services have DataSourceRegistry + ClusterProvider injected
7. **Repository access pattern** - All use `await this.getRepository()` helpers or direct `this.registry.get(cluster).getRepository(Entity)`

## Implementation Notes

### Helper Method Pattern (Recommended)
```typescript
private async getTokenRepository(): Promise<Repository<Token>> {
  const cluster = this.clusterProvider.cluster;
  const dataSource = this.registryService.get(cluster);
  return dataSource.getRepository(Token);
}
```

### Direct Access Pattern (Alternative)
```typescript
const token = await this.registry.get(this.clusterProvider.cluster)
  .getRepository(Token)
  .findOne({ where: { address } });
```

## PR Requirements

This phase MUST be a single atomic PR that includes:
- [ ] All 7 service migrations
- [ ] Updated docs (phase-5-migration-pattern.md, cluster-partitioning.md)
- [ ] CI passing (build, lint, tests)
- [ ] Grep gate validation passing
- [ ] All existing tests passing

## Post-Phase 5

Once this phase is complete and merged:
- Phase 6: UI cluster toggle implementation
- Phase 7: E2E tests and verification
