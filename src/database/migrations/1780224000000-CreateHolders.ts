// import { MigrationInterface, QueryRunner } from "typeorm";
//
// export class CreateHolders1780224000000 implements MigrationInterface {
//     name = "CreateHolders1780224000000";
//
//     public async up(queryRunner: QueryRunner): Promise<void> {
//         await queryRunner.query(`
//             CREATE TABLE "holders" (
//                 "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
//                 "tokenMint" character varying NOT NULL,
//                 "network" character varying NOT NULL DEFAULT 'mainnet',
//                 "wallet" character varying NOT NULL,
//                 "balance" numeric(40,0) NOT NULL,
//                 "lastActiveSlot" bigint NOT NULL,
//                 "lastActiveTs" bigint NOT NULL,
//                 "totalBoughtRaw" numeric(40,0) NOT NULL DEFAULT '0',
//                 "totalSoldRaw" numeric(40,0) NOT NULL DEFAULT '0',
//                 "totalBoughtUsd" double precision NOT NULL DEFAULT 0,
//                 "totalSoldUsd" double precision NOT NULL DEFAULT 0,
//                 "buyTxCount" integer NOT NULL DEFAULT 0,
//                 "sellTxCount" integer NOT NULL DEFAULT 0,
//                 "updatedAt" bigint NOT NULL,
//                 CONSTRAINT "PK_holders_id" PRIMARY KEY ("id"),
//                 CONSTRAINT "UQ_holders_token_network_wallet" UNIQUE ("tokenMint", "network", "wallet")
//             )
//         `);
//         await queryRunner.query(`CREATE INDEX "IDX_holders_token_network_balance" ON "holders" ("tokenMint", "network", "balance")`);
//     }
//
//     public async down(queryRunner: QueryRunner): Promise<void> {
//         await queryRunner.query(`DROP INDEX "public"."IDX_holders_token_network_balance"`);
//         await queryRunner.query(`DROP TABLE "holders"`);
//     }
// }
