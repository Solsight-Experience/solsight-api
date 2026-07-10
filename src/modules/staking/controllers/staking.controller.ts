import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { BuildStakingTransactionDto } from "../dtos/build-staking-transaction.dto";
import { GetStakingHistoryDto } from "../dtos/get-staking-history.dto";
import { GetStakingPositionDto } from "../dtos/get-staking-position.dto";
import { StakingService } from "../services/staking.service";
import { RequestCluster } from "../../../common/cluster/request-cluster.decorator";
import type { Cluster } from "../../../common/cluster/cluster.types";

@Controller("staking")
export class StakingController {
    constructor(private readonly stakingService: StakingService) {}

    @Get("position")
    getPosition(@RequestCluster() cluster: Cluster, @Query() dto: GetStakingPositionDto) {
        return this.stakingService.getPosition(cluster, dto);
    }

    @Get("history")
    getHistory(@RequestCluster() cluster: Cluster, @Query() dto: GetStakingHistoryDto) {
        return this.stakingService.getHistory(cluster, dto);
    }

    @Get("validators")
    getValidators(@RequestCluster() cluster: Cluster) {
        return this.stakingService.getValidators(cluster);
    }

    @Post("transaction")
    buildTransaction(@RequestCluster() cluster: Cluster, @Body() dto: BuildStakingTransactionDto) {
        return this.stakingService.buildTransaction(cluster, dto);
    }
}
