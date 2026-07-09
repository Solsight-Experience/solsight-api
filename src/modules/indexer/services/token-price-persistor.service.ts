import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { logError } from "../../../common/errors/error-helper";
import { Token } from "../../tokens/entities/token.entity";
import { MAX_PRICE_USD } from "../../tokens/types/swap-event.types";

@Injectable()
export class TokenPricePersistorService {
    private readonly logger = new Logger(TokenPricePersistorService.name);

    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>
    ) {}

    /** Project the newest durable market-price event into each token's fallback price. */
    @Cron("*/2 * * * *")
    async persistLatestPrices(): Promise<void> {
        try {
            const rows = await this.tokenRepository.query<Array<{ updatedCount: number | string }>>(
                `
                    WITH latest_prices AS (
                        SELECT DISTINCT ON (event."tokenMint", event."network")
                            event."tokenMint",
                            event."network",
                            event."price"
                        FROM "market_price_events" event
                        WHERE event."price" > 0
                          AND event."price" < $1
                        ORDER BY
                            event."tokenMint" ASC,
                            event."network" ASC,
                            event."slot" DESC,
                            event."timestamp" DESC,
                            event."createdAt" DESC
                    ), updated_tokens AS (
                        UPDATE "tokens" token
                        SET
                            "price" = latest."price",
                            "updatedAt" = CURRENT_TIMESTAMP
                        FROM latest_prices latest
                        WHERE token."address" = latest."tokenMint"
                          AND token."network" = latest."network"
                          AND token."price" IS DISTINCT FROM latest."price"
                        RETURNING token."id"
                    )
                    SELECT COUNT(*)::int AS "updatedCount"
                    FROM updated_tokens
                `,
                [MAX_PRICE_USD]
            );

            const updatedCount = Number(rows[0]?.updatedCount ?? 0);
            if (updatedCount > 0) {
                this.logger.debug(`Persisted latest prices for ${updatedCount} tokens`);
            }
        } catch (error) {
            logError(this.logger, "Latest token price persist failed", error);
        }
    }
}
