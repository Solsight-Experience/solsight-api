import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFavoriteTokens1780302300000 implements MigrationInterface {
    name = "CreateFavoriteTokens1780302300000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "favorite_tokens" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "tokenAddress" character varying NOT NULL,
                "network" character varying NOT NULL DEFAULT 'mainnet',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_favorite_tokens_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_favorite_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
                CONSTRAINT "UQ_favorite_tokens_user_token_network" UNIQUE ("userId", "tokenAddress", "network")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_favorite_tokens_user" ON "favorite_tokens" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_favorite_tokens_token_network" ON "favorite_tokens" ("tokenAddress", "network")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_favorite_tokens_token_network"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_favorite_tokens_user"`);
        await queryRunner.query(`DROP TABLE "favorite_tokens"`);
    }
}
