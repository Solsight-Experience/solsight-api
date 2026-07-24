import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDailyReportSettings1783500000000 implements MigrationInterface {
    name = "CreateDailyReportSettings1783500000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "daily_report_settings_channel_enum" AS ENUM ('telegram', 'email')`);
        await queryRunner.query(`
            CREATE TABLE "daily_report_settings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "enabled" boolean NOT NULL DEFAULT false,
                "channel" "daily_report_settings_channel_enum" NOT NULL DEFAULT 'telegram',
                "hourUtc" smallint,
                "minuteUtc" smallint,
                "timezone" character varying,
                "lastSentDate" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_daily_report_settings_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_daily_report_settings_userId" ON "daily_report_settings" ("userId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_daily_report_settings_userId"`);
        await queryRunner.query(`DROP TABLE "daily_report_settings"`);
        await queryRunner.query(`DROP TYPE "daily_report_settings_channel_enum"`);
    }
}
