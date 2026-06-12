import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1780139495499 implements MigrationInterface {
    name = "Migration1780139495499";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_c509f61bb84d127af28d55696a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ecb4bb8f23e9ec7a1c54615a94"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d0fdf11c9ba14b65465f19f8dc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e77312a821890bd2b66eaa4cf7"`);
        await queryRunner.query(`ALTER TABLE "ohlc_candles" ADD "network" character varying NOT NULL DEFAULT 'mainnet'`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "network" character varying NOT NULL DEFAULT 'mainnet'`);
        await queryRunner.query(`ALTER TABLE "swap_trades" ADD "network" character varying NOT NULL DEFAULT 'mainnet'`);
        await queryRunner.query(`ALTER TABLE "wallet_snapshots" ADD "network" character varying NOT NULL DEFAULT 'mainnet'`);
        await queryRunner.query(`ALTER TABLE "market_price_events" ADD "network" character varying NOT NULL DEFAULT 'mainnet'`);
        await queryRunner.query(`ALTER TABLE "tokens" ALTER COLUMN "network" SET DEFAULT 'mainnet'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_092455e1f4e7970d7139941d89" ON "tokens" ("address", "network") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_0a91eb48fb3777a3271cda6c03" ON "ohlc_candles" ("tokenMint", "network", "interval", "timestamp") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_22186cd05b22bc6a5ef6674faf" ON "transactions" ("signature", "network") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7ecd6944a2758ccd1a65d1c932" ON "swap_trades" ("signature", "network") `);
        await queryRunner.query(`CREATE INDEX "IDX_77d2d482aa013b3426585c817e" ON "swap_trades" ("walletAddress", "network", "timestamp") `);
        await queryRunner.query(`CREATE INDEX "IDX_2621fe7729e75bf02cdc3d2d50" ON "wallet_snapshots" ("walletAddress", "network", "snapshot_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_2dd3fb65e80fa5a7faf2862970" ON "market_price_events" ("tokenMint", "network", "timestamp") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_2dd3fb65e80fa5a7faf2862970"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2621fe7729e75bf02cdc3d2d50"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_77d2d482aa013b3426585c817e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7ecd6944a2758ccd1a65d1c932"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_22186cd05b22bc6a5ef6674faf"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0a91eb48fb3777a3271cda6c03"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_092455e1f4e7970d7139941d89"`);
        await queryRunner.query(`ALTER TABLE "tokens" ALTER COLUMN "network" SET DEFAULT 'solana'`);
        await queryRunner.query(`ALTER TABLE "market_price_events" DROP COLUMN "network"`);
        await queryRunner.query(`ALTER TABLE "wallet_snapshots" DROP COLUMN "network"`);
        await queryRunner.query(`ALTER TABLE "swap_trades" DROP COLUMN "network"`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "network"`);
        await queryRunner.query(`ALTER TABLE "ohlc_candles" DROP COLUMN "network"`);
        await queryRunner.query(`CREATE INDEX "IDX_e77312a821890bd2b66eaa4cf7" ON "market_price_events" ("tokenMint", "timestamp") `);
        await queryRunner.query(`CREATE INDEX "IDX_d0fdf11c9ba14b65465f19f8dc" ON "wallet_snapshots" ("walletAddress", "snapshot_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_ecb4bb8f23e9ec7a1c54615a94" ON "swap_trades" ("walletAddress", "timestamp") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c509f61bb84d127af28d55696a" ON "ohlc_candles" ("tokenMint", "interval", "timestamp") `);
    }
}
