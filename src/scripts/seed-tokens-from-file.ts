import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { Injectable, Logger, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule, InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import configuration from "../config/configuration";
import { DatabaseModule } from "../database/database.module";
import { JupiterModule } from "../infra/jupiter/jupiter.module";
import { JupiterService } from "../infra/jupiter/jupiter.service";
import { Token } from "../modules/tokens/entities/token.entity";

const BATCH_SIZE = 500;
const SEARCH_BATCH_SIZE = 100;

interface JupiterSearchToken {
    id: string;
    symbol?: string;
    name?: string;
    decimals?: number;
    icon?: string;
    logoURI?: string;
    extensions?: {
        coingeckoId?: string;
    };
}

function getFilePathFromArgs(): string {
    const argPath = process.argv[2] || process.env.TOKEN_LIST_FILE;
    if (!argPath) {
        throw new Error("Missing token file path. Pass it as first arg or set TOKEN_LIST_FILE.");
    }

    const resolvedPath = resolve(argPath);
    if (!existsSync(resolvedPath)) {
        throw new Error(`Token file not found: ${resolvedPath}`);
    }

    return resolvedPath;
}

function parseTokenAddresses(filePath: string): string[] {
    const raw = readFileSync(filePath, "utf8");

    const unique = new Set<string>();
    for (const line of raw.split(/\r?\n/)) {
        const address = line.trim();
        if (!address || address.startsWith("#")) {
            continue;
        }

        unique.add(address);
    }

    return Array.from(unique);
}

@Injectable()
class SeedTokensFromFileService {
    private readonly logger = new Logger(SeedTokensFromFileService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly jupiterService: JupiterService,
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>
    ) {}

    private async fetchFromSearchApi(addresses: string[]): Promise<Map<string, JupiterSearchToken>> {
        const searchBaseUrl = `${this.configService.get<string>("jupiter.apiUrl")}/tokens/v2/search?query=`;
        const jupiterApiKey = this.configService.get<string>("jupiter.apiKey");
        if (!searchBaseUrl) {
            throw new Error("Missing jupiter.apiUrl configuration");
        }

        const tokenByAddress = new Map<string, JupiterSearchToken>();

        for (let i = 0; i < addresses.length; i += SEARCH_BATCH_SIZE) {
            const batch = addresses.slice(i, i + SEARCH_BATCH_SIZE);
            const url = `${searchBaseUrl}${batch.join(",")}`;

            try {
                const response = await fetch(url, {
                    headers: jupiterApiKey
                        ? {
                              "x-api-key": jupiterApiKey
                          }
                        : undefined
                });
                if (!response.ok) {
                    this.logger.warn(`Search API request failed (${response.status}) for batch starting at ${i}`);
                    continue;
                }

                const tokens = (await response.json()) as JupiterSearchToken[];
                for (const token of tokens) {
                    if (token?.id) {
                        tokenByAddress.set(token.id, token);
                    }
                }
            } catch {
                this.logger.warn(`Search API fetch failed for batch starting at ${i}`);
            }
        }

        return tokenByAddress;
    }

    async run(filePath: string): Promise<void> {
        const addresses = parseTokenAddresses(filePath);
        if (!addresses.length) {
            this.logger.warn("No token addresses found in input file.");
            return;
        }

        this.logger.log(`Found ${addresses.length} unique addresses in ${filePath}`);

        const tokenList = await this.jupiterService.getTokenList();
        const tokenByAddress = new Map(tokenList.map((token) => [token.id, token]));
        let searchTokenByAddress: Map<string, JupiterSearchToken> | null = null;

        if (tokenByAddress.size === 0) {
            this.logger.warn("Jupiter token list unavailable. Falling back to solana.jupiterApi.searchToken endpoint.");
            searchTokenByAddress = await this.fetchFromSearchApi(addresses);
        }

        const now = new Date();
        const rows: Partial<Token>[] = [];
        const missing: string[] = [];

        for (const address of addresses) {
            const token = tokenByAddress.get(address);
            const searchToken = token ? null : searchTokenByAddress?.get(address);
            if (!token && !searchToken) {
                missing.push(address);
                continue;
            }

            rows.push({
                address,
                symbol: token?.symbol ?? searchToken?.symbol ?? "UNKNOWN",
                name: token?.name ?? searchToken?.name ?? address,
                decimals: token?.decimals ?? searchToken?.decimals ?? 0,
                logoUri: token?.icon ?? searchToken?.logoURI,
                coingeckoId: token?.extensions?.coingeckoId ?? searchToken?.extensions?.coingeckoId,
                network: "solana",
                updatedAt: now
            });
        }

        this.logger.log(`Resolved ${rows.length} tokens from Jupiter metadata`);
        this.logger.log(`Missing ${missing.length} tokens not present in Jupiter token list`);

        if (rows.length === 0) {
            return;
        }

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            await this.tokenRepository.upsert(batch, ["address"]);
            this.logger.log(`Upserted ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
        }

        if (missing.length > 0) {
            const preview = missing.slice(0, 30);
            this.logger.warn(`Missing token preview (${preview.length}/${missing.length}): ${preview.join(", ")}`);
        }

        this.logger.log("Seed completed.");
    }
}

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [configuration],
            validationOptions: {
                allowUnknown: true,
                abortEarly: true
            }
        }),
        DatabaseModule,
        JupiterModule,
        TypeOrmModule.forFeature([Token])
    ],
    providers: [SeedTokensFromFileService]
})
class SeedTokensFromFileModule {}

async function bootstrap() {
    const filePath = getFilePathFromArgs();
    const app = await NestFactory.createApplicationContext(SeedTokensFromFileModule, {
        logger: ["log", "warn", "error"]
    });

    try {
        const seeder = app.get(SeedTokensFromFileService);
        await seeder.run(filePath);
    } finally {
        await app.close();
    }
}

bootstrap().catch((error: unknown) => {
    const logger = new Logger("SeedTokensFromFileBootstrap");
    logger.error("Seed script failed", error as Error);
    process.exitCode = 1;
});
