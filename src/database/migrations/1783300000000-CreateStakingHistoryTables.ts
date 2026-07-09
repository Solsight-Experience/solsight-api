import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateStakingHistoryTables1783300000000 implements MigrationInterface {
    name = "CreateStakingHistoryTables1783300000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_type
                    WHERE typname = 'staking_history_action_type_enum'
                ) THEN
                    CREATE TYPE "staking_history_action_type_enum" AS ENUM ('stake', 'unstake', 'withdraw', 'cancel');
                END IF;

                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_type
                    WHERE typname = 'staking_history_status_enum'
                ) THEN
                    CREATE TYPE "staking_history_status_enum" AS ENUM ('pending', 'confirmed', 'failed', 'cooling_down', 'withdrawn');
                END IF;
            END $$;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "staking_history" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "signature" character varying NOT NULL,
                "cluster" character varying NOT NULL,
                "walletAddress" character varying NOT NULL,
                "stakeAccountAddress" character varying NOT NULL,
                "actionType" "staking_history_action_type_enum" NOT NULL,
                "status" "staking_history_status_enum" NOT NULL,
                "amountSol" numeric(30,9) NOT NULL,
                "slot" bigint,
                "blockTime" TIMESTAMPTZ NOT NULL,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "PK_staking_history_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_staking_history_signature" UNIQUE ("signature")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_staking_history_cluster_stake_block_time_signature"
            ON "staking_history" ("cluster", "stakeAccountAddress", "blockTime" DESC, "signature" DESC)
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_staking_history_cluster_wallet_block_time_signature"
            ON "staking_history" ("cluster", "walletAddress", "blockTime" DESC, "signature" DESC)
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "staking_history_sync_state" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "cluster" character varying NOT NULL,
                "walletAddress" character varying NOT NULL,
                "stakeAccountAddress" character varying NOT NULL,
                "newestSyncedSignature" character varying,
                "oldestSyncedSignature" character varying,
                "hasReachedOldestHistory" boolean NOT NULL DEFAULT false,
                "lastSyncedAt" TIMESTAMPTZ,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "PK_staking_history_sync_state_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_staking_history_sync_state_cluster_stake_account" UNIQUE ("cluster", "stakeAccountAddress")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "staking_history_sync_state"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_staking_history_cluster_wallet_block_time_signature"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_staking_history_cluster_stake_block_time_signature"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "staking_history"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "staking_history_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "staking_history_action_type_enum"`);
    }
}
