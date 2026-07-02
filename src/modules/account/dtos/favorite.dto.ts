import { TokenOverviewResponseDto } from "../../tokens/dtos/token.response.dto";

export type FavoriteTokenDto = {
    token_address: string;
    added_at: string;
    token: TokenOverviewResponseDto | null;
};

export type AddFavoriteDto = {
    token_address: string;
};
