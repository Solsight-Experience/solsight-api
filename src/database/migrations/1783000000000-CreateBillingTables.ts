import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBillingTables1783000000000 implements MigrationInterface {
    name = "CreateBillingTables1783000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "user_credits" (
                "userId" character varying NOT NULL,
                "balance" integer NOT NULL DEFAULT 0,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_user_credits_userId" PRIMARY KEY ("userId"),
                CONSTRAINT "CHK_user_credits_balance_non_negative" CHECK ("balance" >= 0)
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "feature_usage" (
                "userId" character varying NOT NULL,
                "usageDate" date NOT NULL,
                "count" integer NOT NULL DEFAULT 0,
                CONSTRAINT "PK_feature_usage_userId_usageDate" PRIMARY KEY ("userId", "usageDate")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "payment_orders" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "packageCode" character varying NOT NULL,
                "credits" integer NOT NULL,
                "amountLamports" bigint NOT NULL,
                "network" character varying NOT NULL DEFAULT 'mainnet',
                "status" character varying NOT NULL DEFAULT 'pending',
                "txSignature" character varying,
                "memo" character varying NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "expiresAt" TIMESTAMP NOT NULL,
                "completedAt" TIMESTAMP,
                CONSTRAINT "PK_payment_orders_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_payment_orders_txSignature" UNIQUE ("txSignature")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_payment_orders_status_expiresAt" ON "payment_orders" ("status", "expiresAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_payment_orders_userId_createdAt" ON "payment_orders" ("userId", "createdAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_payment_orders_userId_createdAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_payment_orders_status_expiresAt"`);
        await queryRunner.query(`DROP TABLE "payment_orders"`);
        await queryRunner.query(`DROP TABLE "feature_usage"`);
        await queryRunner.query(`DROP TABLE "user_credits"`);
    }
}
