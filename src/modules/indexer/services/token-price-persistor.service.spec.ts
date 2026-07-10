import { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";
import type { Token } from "../../tokens/entities/token.entity";
import { MAX_PRICE_USD } from "../../tokens/types/swap-event.types";
import { TokenPricePersistorService } from "./token-price-persistor.service";

describe("TokenPricePersistorService", () => {
    let service: TokenPricePersistorService;
    let tokenRepository: Pick<Repository<Token>, "query">;

    beforeEach(() => {
        tokenRepository = {
            query: jest.fn().mockResolvedValue([{ updatedCount: 2 }])
        };
        service = new TokenPricePersistorService(tokenRepository as Repository<Token>);
    });

    it("projects the latest valid event per network and mint into tokens.price", async () => {
        const loggerSpy = jest.spyOn(Logger.prototype, "debug").mockImplementation();

        await service.persistLatestPrices();

        expect(tokenRepository.query).toHaveBeenCalledWith(
            expect.stringMatching(/DISTINCT ON \(event\."tokenMint", event\."network"\)[\s\S]*event\."slot" DESC[\s\S]*UPDATE "tokens"/),
            [MAX_PRICE_USD]
        );
        expect(loggerSpy).toHaveBeenCalledWith("Persisted latest prices for 2 tokens");
    });
});
