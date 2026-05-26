# Cluster Partitioning Architecture

## Overview

The solsight-api implements cluster-based schema partitioning to support mainnet and devnet environments simultaneously. Each cluster (mainnet/devnet) has its own PostgreSQL schema with isolated data, while shared entities (User, Wallet, etc.) reside in the public schema.

## Entity Classification

### Partitioned Entities (7)
These entities exist in both mainnet and devnet schemas:
- **Token**: Token metadata indexed from chain
- **OhlcCandle**: OHLC candlestick data
- **Category**: Token categories
- **Transaction**: On-chain transactions
- **SwapTrade**: DEX swap trades
- **WalletSnapshot**: Historical wallet balances
- **MarketPriceEvent**: Price events from stream

### Shared Entities (8)
These entities exist only in the public schema:
- **User**: Application users (cluster-agnostic)
- **Wallet**: User wallet addresses
- **EmailSubscription**: Email notification subscriptions
- **Notification**: Push/email notifications
- **ZaloSubscription**: Zalo bot subscriptions
- **WalletAlert**: Price alerts
- **WatchedWallet**: Public wallet tracking
- **Audit**: Audit log entries

## Schema Structure

```
Database: flaxh_trade
├── public/
│   ├── users
│   ├── wallets
│   ├── email_subscriptions
│   ├── notifications
│   ├── zalo_subscriptions
│   ├── wallet_alerts
│   ├── watched_wallets
│   └── audit_logs
├── mainnet/
│   ├── tokens
│   ├── ohlc_candles
│   ├── categories
│   ├── transactions
│   ├── swap_trades
│   ├── wallet_snapshots
│   └── market_price_events
└── devnet/
    ├── tokens
    ├── ohlc_candles
    ├── categories
    ├── transactions
    ├── swap_trades
    ├── wallet_snapshots
    └── market_price_events
```

## Runtime Behavior

### Request Flow
1. HTTP request arrives with optional `?cluster=devnet` query param
2. ClusterInterceptor validates cluster value (mainnet/devnet)
3. Defaults to mainnet if not specified
4. Sets `request.cluster` for downstream access

### Service Access
Services inject `DataSourceRegistry` and call:
```typescript
const dataSource = this.registry.get(cluster); // Get cluster's DataSource
const repository = dataSource.getRepository(Token);
```

## Migration System

### Partitioned Migrations
- Location: `src/database/migrations/partitioned/`
- Run against: mainnet and devnet schemas
- Must be identical across clusters
- Generated via: `pnpm run migration:generate:partitioned <name>`

### Shared Migrations
- Location: `src/database/migrations/shared/`
- Run against: public schema only
- Generated via: `pnpm run migration:generate:shared <name>`

## Operations

### Schema Drift Detection
Ensures mainnet and devnet schemas remain identical:
```bash
pnpm run schema:drift-check
```

### Reset Development Schemas
Drops and recreates all schemas with fresh migrations:
```bash
pnpm run reset-schemas
```

### Migration Validation
CI gate ensures no @InjectRepository on partitioned entities:
```bash
bash scripts/check-no-injectrepository-partitioned.sh
```

## Design Rationale

### Why Per-Cluster DataSources?
- Schema is baked into TypeORM metadata at DataSource construction
- Applies to all generated SQL (SELECT, INSERT, JOINs, relations)
- Works with pgBouncer in any pooling mode
- Services remain singletons; cluster passed as method parameter

### Why Schema-Based Partitioning?
- Clean separation at database layer
- Supports full ACID transactions per cluster
- Enables independent backups/restores
- Simplifies drift detection and remediation

### Why Shared Entities in Public?
- User identity and wallet addresses are cluster-agnostic
- User can access same wallets across mainnet/devnet
- Eliminates cross-schema foreign key complexity
- Reduces data duplication

## Constraints

- `synchronize: false` unconditionally for all DataSources
- `migrationsRun: false` - migrations run via CLI only
- Each cluster DataSource gets Math.floor(totalPool / 2) connections
- Transaction.fromWallet/toWallet replaced with plain walletAddress columns
- No `@InjectRepository` on partitioned entities (validated by CI gate)
