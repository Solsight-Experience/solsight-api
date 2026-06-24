export class PriceHistoryPointDto {
    timestamp!: number;
    price!: number;
}

export class PriceHistoryResponseDto {
    history!: PriceHistoryPointDto[];
}
