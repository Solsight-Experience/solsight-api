import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFavorites1782900000000 implements MigrationInterface {
    name = "CreateFavorites1782900000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "favorites" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "tokenAddress" character varying NOT NULL,
                "network" character varying NOT NULL DEFAULT 'mainnet',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_favorites_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_favorites_userId_tokenAddress_network" UNIQUE ("userId", "tokenAddress", "network")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_favorites_userId_network" ON "favorites" ("userId", "network")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_favorites_userId_network"`);
        await queryRunner.query(`DROP TABLE "favorites"`);
    }
}
