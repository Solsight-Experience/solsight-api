import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { BuildStakingTransactionDto } from "../dtos/build-staking-transaction.dto";
import { GetStakingHistoryDto } from "../dtos/get-staking-history.dto";
import { GetStakingPositionDto } from "../dtos/get-staking-position.dto";
import { StakingService } from "../services/staking.service";

@Controller("staking")
export class StakingController {
    constructor(private readonly stakingService: StakingService) {}

    @Get("position")
    getPosition(@Query() dto: GetStakingPositionDto) {
        return this.stakingService.getPosition(dto);
    }

    @Get("history")
    getHistory(@Query() dto: GetStakingHistoryDto) {
        return this.stakingService.getHistory(dto);
    }

    @Post("transaction")
    buildTransaction(@Body() dto: BuildStakingTransactionDto) {
        return this.stakingService.buildTransaction(dto);
    }
}
