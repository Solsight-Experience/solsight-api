import { JupiterTokenMintInformation } from "../../../infra/jupiter/types";

export interface JupiterSeedToken extends JupiterTokenMintInformation {
    description?: string | null;
}
