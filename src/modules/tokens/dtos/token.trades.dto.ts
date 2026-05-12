import { IsOptional, IsNumber } from "class-validator";
import { Type } from "class-transformer";

export class TradesQueryDto {
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    limit?: number = 50;
}
