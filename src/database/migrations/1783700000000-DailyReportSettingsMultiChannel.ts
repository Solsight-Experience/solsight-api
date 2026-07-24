import { MigrationInterface, QueryRunner } from "typeorm";

export class DailyReportSettingsMultiChannel1783700000000 implements MigrationInterface {
    name = "DailyReportSettingsMultiChannel1783700000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "daily_report_settings" ADD "channels" "daily_report_settings_channel_enum"[] NOT NULL DEFAULT '{telegram}'`);
        await queryRunner.query(`UPDATE "daily_report_settings" SET "channels" = ARRAY["channel"]`);
        await queryRunner.query(`ALTER TABLE "daily_report_settings" DROP COLUMN "channel"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "daily_report_settings" ADD "channel" "daily_report_settings_channel_enum" NOT NULL DEFAULT 'telegram'`);
        await queryRunner.query(`UPDATE "daily_report_settings" SET "channel" = "channels"[1]`);
        await queryRunner.query(`ALTER TABLE "daily_report_settings" DROP COLUMN "channels"`);
    }
}
