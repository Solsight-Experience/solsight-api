import { MigrationInterface, QueryRunner } from "typeorm";

export class MigrateStakingToDualMode1783400000000 implements MigrationInterface {
    name = "MigrateStakingToDualMode1783400000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Clean cutover: no real users on the old Insurance Fund program, so the old
        // history rows/enum values are dropped rather than migrated.
        await queryRunner.query(`TRUNCATE TABLE "staking_history"`);
        await queryRunner.query(`TRUNCATE TABLE "staking_history_sync_state"`);

        await queryRunner.query(`ALTER TABLE "staking_history" ALTER COLUMN "actionType" TYPE varchar`);
        await queryRunner.query(`ALTER TABLE "staking_history" ALTER COLUMN "status" TYPE varchar`);
        await queryRunner.query(`DROP TYPE IF EXISTS "staking_history_action_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "staking_history_status_enum"`);

        await queryRunner.query(
            `CREATE TYPE "staking_history_action_type_enum" AS ENUM ('stake_liquid', 'unstake_liquid', 'stake_native', 'unstake_native', 'withdraw_native')`
        );
        await queryRunner.query(`CREATE TYPE "staking_history_status_enum" AS ENUM ('pending', 'confirmed', 'failed')`);

        await queryRunner.query(
            `ALTER TABLE "staking_history" ALTER COLUMN "actionType" TYPE "staking_history_action_type_enum" USING "actionType"::"staking_history_action_type_enum"`
        );
        await queryRunner.query(
            `ALTER TABLE "staking_history" ALTER COLUMN "status" TYPE "staking_history_status_enum" USING "status"::"staking_history_status_enum"`
        );

        await queryRunner.query(`ALTER TABLE "staking_history" ADD COLUMN IF NOT EXISTS "voteAccount" character varying`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "staking_native_accounts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "cluster" character varying NOT NULL,
                "walletAddress" character varying NOT NULL,
                "voteAccount" character varying NOT NULL,
                "seed" character varying NOT NULL,
                "address" character varying NOT NULL,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "PK_staking_native_accounts_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_staking_native_accounts_cluster_address"
            ON "staking_native_accounts" ("cluster", "address")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_staking_native_accounts_cluster_wallet"
            ON "staking_native_accounts" ("cluster", "walletAddress")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_staking_native_accounts_cluster_wallet"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_staking_native_accounts_cluster_address"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "staking_native_accounts"`);

        await queryRunner.query(`ALTER TABLE "staking_history" DROP COLUMN IF EXISTS "voteAccount"`);

        await queryRunner.query(`TRUNCATE TABLE "staking_history"`);
        await queryRunner.query(`ALTER TABLE "staking_history" ALTER COLUMN "actionType" TYPE varchar`);
        await queryRunner.query(`ALTER TABLE "staking_history" ALTER COLUMN "status" TYPE varchar`);
        await queryRunner.query(`DROP TYPE IF EXISTS "staking_history_action_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "staking_history_status_enum"`);

        await queryRunner.query(`CREATE TYPE "staking_history_action_type_enum" AS ENUM ('stake', 'unstake', 'withdraw', 'cancel')`);
        await queryRunner.query(`CREATE TYPE "staking_history_status_enum" AS ENUM ('pending', 'confirmed', 'failed', 'cooling_down', 'withdrawn')`);

        await queryRunner.query(
            `ALTER TABLE "staking_history" ALTER COLUMN "actionType" TYPE "staking_history_action_type_enum" USING "actionType"::"staking_history_action_type_enum"`
        );
        await queryRunner.query(
            `ALTER TABLE "staking_history" ALTER COLUMN "status" TYPE "staking_history_status_enum" USING "status"::"staking_history_status_enum"`
        );
    }
}
