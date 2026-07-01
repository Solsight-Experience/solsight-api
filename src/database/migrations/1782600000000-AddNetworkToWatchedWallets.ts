import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNetworkToWatchedWallets1782600000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add network column with default "mainnet" for existing rows
        await queryRunner.query(`
            ALTER TABLE "watched_wallets"
            ADD COLUMN IF NOT EXISTS "network" varchar NOT NULL DEFAULT 'mainnet'
        `);

        // Drop old unique constraint (userId, walletAddress)
        await queryRunner.query(`
            ALTER TABLE "watched_wallets"
            DROP CONSTRAINT IF EXISTS "UQ_watched_wallets_userId_walletAddress"
        `);

        // Add new unique constraint (userId, walletAddress, network)
        await queryRunner.query(`
            ALTER TABLE "watched_wallets"
            ADD CONSTRAINT "UQ_watched_wallets_userId_walletAddress_network"
            UNIQUE ("userId", "walletAddress", "network")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "watched_wallets"
            DROP CONSTRAINT IF EXISTS "UQ_watched_wallets_userId_walletAddress_network"
        `);

        await queryRunner.query(`
            ALTER TABLE "watched_wallets"
            ADD CONSTRAINT "UQ_watched_wallets_userId_walletAddress"
            UNIQUE ("userId", "walletAddress")
        `);

        await queryRunner.query(`
            ALTER TABLE "watched_wallets"
            DROP COLUMN IF EXISTS "network"
        `);
    }
}
