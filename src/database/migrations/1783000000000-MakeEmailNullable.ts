import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeEmailNullable1783000000000 implements MigrationInterface {
    name = "MakeEmailNullable1783000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL`);
    }
}
