export class HolderPnlChartPointDto {
    timestamp!: number;
    realized_pnl!: number;
    unrealized_pnl!: number;
    total_pnl!: number;
    balance_usd!: number;
}

export class HolderPnlChartResponseDto {
    chart_data!: HolderPnlChartPointDto[];
}
