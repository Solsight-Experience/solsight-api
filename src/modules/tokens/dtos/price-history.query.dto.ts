import { Type } from "class-transformer";
import { IsNumber } from "class-validator";

export class PriceHistoryQueryDto {
    @IsNumber()
    @Type(() => Number)
    from!: number;

    @IsNumber()
    @Type(() => Number)
    to!: number;
}
