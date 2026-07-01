import { MigrationInterface, QueryRunner } from "typeorm";

export class ZaloToTelegram1782700000000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        // Rename table
        await queryRunner.query(`ALTER TABLE IF EXISTS "zalo_subscriptions" RENAME TO "telegram_subscriptions"`);

        // Rename column zaloUserId → telegramChatId
        await queryRunner.query(`
            ALTER TABLE "telegram_subscriptions"
            RENAME COLUMN IF EXISTS "zaloUserId" TO "telegramChatId"
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "telegram_subscriptions"
            RENAME COLUMN IF EXISTS "telegramChatId" TO "zaloUserId"
        `);
        await queryRunner.query(`ALTER TABLE IF EXISTS "telegram_subscriptions" RENAME TO "zalo_subscriptions"`);
    }
}
