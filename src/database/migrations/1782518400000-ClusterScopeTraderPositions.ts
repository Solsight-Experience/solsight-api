import { MigrationInterface, QueryRunner } from "typeorm";

const CLUSTER_SCOPED_UNIQUE = "UQ_trader_positions_wallet_token_network";

export class ClusterScopeTraderPositions1782518400000 implements MigrationInterface {
    name = "ClusterScopeTraderPositions1782518400000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            DECLARE
                constraint_name text;
            BEGIN
                IF to_regclass('public.trader_positions') IS NULL THEN
                    RETURN;
                END IF;

                FOR constraint_name IN
                    SELECT c.conname
                    FROM pg_constraint c
                    JOIN pg_class t ON t.oid = c.conrelid
                    JOIN pg_namespace n ON n.oid = t.relnamespace
                    WHERE n.nspname = 'public'
                      AND t.relname = 'trader_positions'
                      AND c.contype = 'u'
                      AND ARRAY(
                          SELECT a.attname
                          FROM unnest(c.conkey) AS key(attnum)
                          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
                          ORDER BY a.attname
                      ) = ARRAY['tokenMint', 'walletAddress']
                LOOP
                    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I', 'public', 'trader_positions', constraint_name);
                END LOOP;

                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = '${CLUSTER_SCOPED_UNIQUE}'
                      AND conrelid = 'public.trader_positions'::regclass
                ) THEN
                    ALTER TABLE "trader_positions"
                    ADD CONSTRAINT "${CLUSTER_SCOPED_UNIQUE}" UNIQUE ("walletAddress", "tokenMint", "network");
                END IF;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF to_regclass('public.trader_positions') IS NULL THEN
                    RETURN;
                END IF;

                ALTER TABLE "trader_positions" DROP CONSTRAINT IF EXISTS "${CLUSTER_SCOPED_UNIQUE}";
                ALTER TABLE "trader_positions" ADD UNIQUE ("walletAddress", "tokenMint");
            END $$;
        `);
    }
}
