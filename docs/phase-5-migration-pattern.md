# Phase 5 Migration Pattern

This document describes how to migrate chain-data services from @InjectRepository to DataSourceRegistry pattern.

## Services to Migrate (7 total)

1. `src/modules/tokens/services/tokens.service.ts` - Token, OhlcCandle
2. `src/modules/tokens/services/token-summary.service.ts` - Token, OhlcCandle
3. `src/modules/tokens/services/token-seeder.service.ts` - Token, Category
4. `src/modules/transactions/services/transactions.service.ts` - Transaction
5. `src/modules/portfolio/services/portfolio.service.ts` - SwapTrade, WalletSnapshot
6. `src/modules/discovery/services/discovery.service.ts` - Token, OhlcCandle
7. `src/modules/indexer/services/stream-consumer.service.ts` - MarketPriceEvent

## Pattern: Before → After

### BEFORE (Current)
```typescript
@Injectable()
export class TokensService {
  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    @InjectRepository(OhlcCandle)
    private readonly ohlcCandleRepository: Repository<OhlcCandle>,
    // ...
  ) {}

  async getToken(mint: string): Promise<Token> {
    return this.tokenRepository.findOne({ where: { mint } });
  }
}
```

### AFTER (DataSourceRegistry)
```typescript
@Injectable()
export class TokensService {
  constructor(
    private readonly registryService: DataSourceRegistry,
    private readonly clusterProvider: ClusterProvider,
    // other deps...
  ) {}

  async getToken(mint: string): Promise<Token> {
    const cluster = this.clusterProvider.cluster;
    const dataSource = this.registryService.get(cluster);
    const tokenRepository = dataSource.getRepository(Token);
    return tokenRepository.findOne({ where: { mint } });
  }
}
```

## Migration Steps

For EACH service:

1. **Remove @InjectRepository imports** for partitioned entities only (keep shared entity injections)
   - Remove: Token, OhlcCandle, Category, Transaction, SwapTrade, WalletSnapshot, MarketPriceEvent
   - Keep: User, Wallet, EmailSubscription, Notification, ZaloSubscription, WalletAlert, WatchedWallet

2. **Add new dependencies**:
   ```typescript
   private readonly registryService: DataSourceRegistry,
   private readonly clusterProvider: ClusterProvider,
   ```

3. **Wrap repository calls** with cluster-based DataSource lookup:
   ```typescript
   // Before: this.tokenRepository.findOne(...)
   // After:
   const cluster = this.clusterProvider.cluster;
   const dataSource = this.registryService.get(cluster);
   const tokenRepository = dataSource.getRepository(Token);
   return tokenRepository.findOne(...);
   ```

4. **Helper method (optional)** to reduce boilerplate:
   ```typescript
   private async getRepository<T>(entity: EntityTarget<T>): Promise<Repository<T>> {
     const cluster = this.clusterProvider.cluster;
     const dataSource = this.registryService.get(cluster);
     return dataSource.getRepository(entity);
   }

   // Then use as:
   const tokenRepo = await this.getRepository(Token);
   ```

## Entity Imports

Ensure these are imported at the top:
```typescript
import { Token } from '../entities/token.entity';
import { OhlcCandle } from '../entities/ohlc-candle.entity';
import { Category } from '../entities/category.entity';
// etc.
```

## Verification (Grep Gate)

After migration, run:
```bash
bash scripts/check-no-injectrepository-partitioned.sh
```

Should output: `OK: no @InjectRepository for partitioned entities`

## Testing

Each service should have unit tests that:
1. Mock DataSourceRegistry
2. Mock ClusterProvider
3. Verify correct cluster is used
4. Verify correct repository method is called

Example:
```typescript
it('should get token from correct cluster', async () => {
  const cluster = 'devnet';
  mockClusterProvider.cluster = cluster;
  
  const result = await service.getToken('mint123');
  
  expect(mockRegistry.get).toHaveBeenCalledWith('devnet');
  expect(mockTokenRepository.findOne).toHaveBeenCalled();
});
```

## Atomic PR Requirements

All 7 services MUST be migrated in a single PR because:
- Grep gate validates no @InjectRepository remains (multi-file grep)
- Cannot partially migrate without breaking the constraint
- All must land together to maintain consistency

## Success Criteria

- [ ] All 7 services migrated
- [ ] No @InjectRepository on partitioned entities (grep gate passes)
- [ ] All existing tests pass
- [ ] Build passes
- [ ] Lint passes
- [ ] No type errors
