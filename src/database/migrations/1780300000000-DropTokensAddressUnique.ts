import { MigrationInterface, QueryRunner } from "typeorm";

const WSOL_ADDRESS = "So11111111111111111111111111111111111111112";
const LEGACY_TOKENS_ADDRESS_UNIQUE = "UQ_8887c0fb937bc0e9dc36cb62f35";

export class DropTokensAddressUnique1780300000000 implements MigrationInterface {
    name = "DropTokensAddressUnique1780300000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tokens" DROP CONSTRAINT IF EXISTS "tokens_address_key"`);
        await queryRunner.query(`ALTER TABLE "tokens" DROP CONSTRAINT IF EXISTS "${LEGACY_TOKENS_ADDRESS_UNIQUE}"`);
        await queryRunner.query(`
            DO $$
            DECLARE
                constraint_name text;
            BEGIN
                FOR constraint_name IN
                    SELECT c.conname
                    FROM pg_constraint c
                    JOIN pg_class t ON t.oid = c.conrelid
                    JOIN pg_namespace n ON n.oid = t.relnamespace
                    WHERE n.nspname = 'public'
                      AND t.relname = 'tokens'
                      AND c.contype = 'u'
                      AND (
                          SELECT array_agg(a.attname ORDER BY a.attnum)
                          FROM unnest(c.conkey) AS key(attnum)
                          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
                      ) = ARRAY['address']
                LOOP
                    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I', 'public', 'tokens', constraint_name);
                END LOOP;
            END $$;
        `);

        await queryRunner.query(
            `
            INSERT INTO tokens (
                address, network, symbol, name, decimals, "logoUri", "coingeckoId",
                price, "priceChange1h", "priceChange24h", "priceChange7d",
                "marketCap", "marketCapChange24h", fdv, liquidity, "liquidityChange24h",
                "volume24h", "volumeChange24h", "txns24hTotal", "txns24hBuys",
                "txns24hSells", "txns24hChange", "holdersCount", "holdersChange24h",
                "uniqueWallets24h", "top10Percent", "insiderPercent", "mintAuthorityDisabled",
                "freezeAuthorityDisabled", "lpBurnt", "hasSocialLinks", "riskScore", "ageSeconds"
            )
            VALUES (
                $1, 'mainnet', 'WSOL', 'Wrapped SOL', 9, NULL, NULL,
                0, 0, 0, 0,
                0, 0, 0, 0, 0,
                0, 0, 0, 0,
                0, 0, 0, 0,
                0, 0, 0, FALSE,
                FALSE, FALSE, FALSE, 50, 0
            )
            ON CONFLICT ("address", "network") DO NOTHING
            `,
            [WSOL_ADDRESS]
        );

        await queryRunner.query(
            `
            INSERT INTO tokens (
                address, network, symbol, name, decimals, "logoUri", "coingeckoId",
                price, "priceChange1h", "priceChange24h", "priceChange7d",
                "marketCap", "marketCapChange24h", fdv, liquidity, "liquidityChange24h",
                "volume24h", "volumeChange24h", "txns24hTotal", "txns24hBuys",
                "txns24hSells", "txns24hChange", "holdersCount", "holdersChange24h",
                "uniqueWallets24h", "top10Percent", "insiderPercent", "mintAuthorityDisabled",
                "freezeAuthorityDisabled", "lpBurnt", "hasSocialLinks", "riskScore", "ageSeconds"
            )
            SELECT
                address, 'devnet', symbol, name, decimals, "logoUri", "coingeckoId",
                0, 0, 0, 0,
                0, 0, 0, 0, 0,
                0, 0, 0, 0,
                0, 0, 0, 0,
                0, 0, 0, FALSE,
                FALSE, FALSE, FALSE, 50, 0
            FROM tokens
            WHERE address = $1 AND network = 'mainnet'
            ON CONFLICT ("address", "network") DO NOTHING
            `,
            [WSOL_ADDRESS]
        );

        await queryRunner.query(
            `
            INSERT INTO tokens (
                address, network, symbol, name, decimals, "logoUri", "coingeckoId",
                price, "priceChange1h", "priceChange24h", "priceChange7d",
                "marketCap", "marketCapChange24h", fdv, liquidity, "liquidityChange24h",
                "volume24h", "volumeChange24h", "txns24hTotal", "txns24hBuys",
                "txns24hSells", "txns24hChange", "holdersCount", "holdersChange24h",
                "uniqueWallets24h", "top10Percent", "insiderPercent", "mintAuthorityDisabled",
                "freezeAuthorityDisabled", "lpBurnt", "hasSocialLinks", "riskScore", "ageSeconds"
            )
            VALUES (
                $1, 'devnet', 'WSOL', 'Wrapped SOL', 9, NULL, NULL,
                0, 0, 0, 0,
                0, 0, 0, 0, 0,
                0, 0, 0, 0,
                0, 0, 0, 0,
                0, 0, 0, FALSE,
                FALSE, FALSE, FALSE, 50, 0
            )
            ON CONFLICT ("address", "network") DO NOTHING
            `,
            [WSOL_ADDRESS]
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "tokens" WHERE "address" = $1 AND "network" = 'devnet'`, [WSOL_ADDRESS]);
        await queryRunner.query(`ALTER TABLE "tokens" ADD CONSTRAINT "${LEGACY_TOKENS_ADDRESS_UNIQUE}" UNIQUE ("address")`);
    }
}
