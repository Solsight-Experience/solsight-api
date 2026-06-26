import { TokenOverview } from "../../discovery/dtos/discovery.response.dto";

export type FavoriteTokenDto = {
    token_address: string;
    added_at: string;
    token: TokenOverview | null;
};

export type AddFavoriteDto = {
    token_address: string;
};
