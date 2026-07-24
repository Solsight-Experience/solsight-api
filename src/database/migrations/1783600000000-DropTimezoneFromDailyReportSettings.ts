import { MigrationInterface, QueryRunner } from "typeorm";

export class DropTimezoneFromDailyReportSettings1783600000000 implements MigrationInterface {
    name = "DropTimezoneFromDailyReportSettings1783600000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "daily_report_settings" DROP COLUMN "timezone"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "daily_report_settings" ADD "timezone" character varying`);
    }
}
