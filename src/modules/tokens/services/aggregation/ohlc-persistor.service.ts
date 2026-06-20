import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OhlcCandle } from "../../entities/ohlc-candle.entity";
import { OhlcData } from "../../types/swap-event.types";
import { OhlcInterval } from "../socket/room/room.constants";
import { logError } from "src/common/errors/error-helper";

@Injectable()
export class OhlcPersistorService {
    private readonly logger = new Logger(OhlcPersistorService.name);

    constructor(
        @InjectRepository(OhlcCandle)
        private readonly ohlcCandleRepository: Repository<OhlcCandle>
    ) {}

    async flushFinishedBucket(tokenMint: string, network: string, interval: OhlcInterval, timestamp: number, candle: OhlcData): Promise<void> {
        try {
            await this.ohlcCandleRepository
                .createQueryBuilder()
                .insert()
                .into(OhlcCandle)
                .values({
                    tokenMint,
                    network,
                    interval,
                    timestamp,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    volume: candle.volume ?? 0
                })
                .orIgnore()
                .execute();
        } catch (error) {
            logError(this.logger, `Failed to persist OHLC candle for ${network}:${tokenMint}:${interval}:${timestamp}`, error);
        }
    }
}
