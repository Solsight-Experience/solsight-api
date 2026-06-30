import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Token } from "../entities/token.entity";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { JupiterSeedToken } from "../types/token-seeder.types";
import type { Cluster } from "../../../common/cluster/cluster.types";

@Injectable()
export class TokenSeederService implements OnModuleInit {
    private readonly logger = new Logger(TokenSeederService.name);

    constructor(
        private readonly configService: ConfigService,
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>
    ) {}

    onModuleInit(): void {
        this.logger.log("Initializing TokenSeederService...");
    }

    private formatError(error: Error): string {
        return error.message;
    }

    async syncProvisionedTokens(cluster: Cluster, force = false, limit?: number) {
        this.assertMainnet(cluster);
        try {
            const filePath = path.join(process.cwd(), "src/modules/tokens/services/token-seed/provisioned_tokens.txt");
            if (!fs.existsSync(filePath)) {
                this.logger.warn("provisioned_tokens.txt not found, skipping sync.");
                return;
            }

            this.logger.log("Syncing provisioned tokens from file...");
            const JUPITER_CHUNK_SIZE = 100;
            const BATCH_SIZE = JUPITER_CHUNK_SIZE * 30;
            const CHUNK_DELAY_MS = 2100;
            const DELAY_MS = 2100;
            const MAX_RETRIES = 3;
            const UPSERT_CHUNK_SIZE = 1500;
            let buffer: string[] = [];
            let totalProcessed = 0;
            let totalInserted = 0;

            const jupBaseUrl = `${this.configService.get<string>("jupiter.apiUrl")}/tokens/v2/search?query=`;
            const network = cluster;

            const processBatch = async (addresses: string[]) => {
                let newAddresses: string[];
                if (force) {
                    newAddresses = addresses;
                } else {
                    const existing = await this.tokenRepository
                        .createQueryBuilder("t")
                        .select("t.address")
                        .where("t.address IN (:...addresses)", { addresses })
                        .andWhere("t.network = :network", { network })
                        .getMany();
                    const existingSet = new Set(existing.map((t) => t.address));
                    newAddresses = addresses.filter((a) => !existingSet.has(a));
                }

                totalProcessed += addresses.length;

                if (newAddresses.length) {
                    const chunks: string[][] = [];
                    for (let i = 0; i < newAddresses.length; i += JUPITER_CHUNK_SIZE) {
                        chunks.push(newAddresses.slice(i, i + JUPITER_CHUNK_SIZE));
                    }

                    const fetchChunk = async (chunk: string[]): Promise<JupiterSeedToken[]> => {
                        const MAX_FETCH_RETRIES = 4;
                        for (let attempt = 1; attempt <= MAX_FETCH_RETRIES; attempt++) {
                            try {
                                const res = await fetch(jupBaseUrl + chunk.join(","));
                                if (res.status === 429) {
                                    const backoff = attempt * 5000;
                                    this.logger.warn(
                                        `[Provisioned sync] Rate limited (429), waiting ${backoff / 1000}s (attempt ${attempt}/${MAX_FETCH_RETRIES})...`
                                    );
                                    await new Promise((r) => setTimeout(r, backoff));
                                    continue;
                                }
                                if (!res.ok) {
                                    this.logger.warn(`[Provisioned sync] Jupiter chunk failed: HTTP ${res.status} ${res.statusText}`);
                                    return [];
                                }
                                return (await res.json()) as JupiterSeedToken[];
                            } catch (error) {
                                this.logger.warn(`[Provisioned sync] Jupiter chunk error: ${error instanceof Error ? this.formatError(error) : String(error)}`);
                                return [];
                            }
                        }
                        this.logger.warn(`[Provisioned sync] Chunk permanently failed after ${MAX_FETCH_RETRIES} attempts, skipping.`);
                        return [];
                    };

                    const allChunkResults: JupiterSeedToken[][] = [];
                    for (let ci = 0; ci < chunks.length; ci++) {
                        allChunkResults.push(await fetchChunk(chunks[ci]));
                        if (ci < chunks.length - 1) {
                            await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
                        }
                    }
                    const results = allChunkResults;
                    const jupiterData = results.flat();
                    const jupiterMap = new Map<string, JupiterSeedToken>(jupiterData.map((t) => [t.id, t]));

                    const notFoundInJupiter = newAddresses.filter((addr) => !jupiterMap.has(addr));
                    if (notFoundInJupiter.length > 0) {
                        this.logger.warn(`[Provisioned sync] Jupiter returned no data for ${notFoundInJupiter.length} token(s) in this batch.`);
                    }

                    const rows = newAddresses.map((addr) => {
                        const jup = jupiterMap.get(addr);
                        const hasSocial = !!(jup?.twitter || jup?.telegram || jup?.discord || jup?.website);

                        let ageSeconds = 0;
                        const createdAtSource = jup?.createdAt || jup?.firstPool?.createdAt;
                        if (createdAtSource) {
                            ageSeconds = Math.floor((Date.now() - new Date(createdAtSource).getTime()) / 1000);
                        }

                        return {
                            address: addr,
                            network,
                            symbol: jup?.symbol ?? addr.substring(0, 8),
                            name: jup?.name ?? addr.substring(0, 16),
                            decimals: jup?.decimals ?? 9,
                            logoUri: jup?.icon ?? null,
                            description: jup?.description ?? null,
                            website: jup?.website ?? null,
                            socialLinks: {
                                twitter: jup?.twitter ?? null,
                                telegram: jup?.telegram ?? null,
                                discord: jup?.discord ?? null
                            },
                            totalSupply: this.safeNum(jup?.totalSupply),
                            circulatingSupply: this.safeNum(jup?.circSupply),
                            maxSupply: 0,
                            price: this.safeNum(jup?.usdPrice),
                            priceChange1h: this.safeNum(jup?.stats1h?.priceChange),
                            priceChange24h: this.safeNum(jup?.stats24h?.priceChange),
                            priceChange7d: this.safeNum(jup?.stats7d?.priceChange),
                            marketCap: this.safeNum(jup?.mcap),
                            marketCapChange24h: 0,
                            fdv: this.safeNum(jup?.fdv),
                            liquidity: this.safeNum(jup?.liquidity),
                            liquidityChange24h: this.safeNum(jup?.stats24h?.liquidityChange),
                            volume24h: this.safeNum(jup?.stats24h?.buyVolume) + this.safeNum(jup?.stats24h?.sellVolume),
                            volumeChange24h: this.safeNum(jup?.stats24h?.volumeChange),
                            txns24hBuys: this.safeNum(jup?.stats24h?.numBuys),
                            txns24hSells: this.safeNum(jup?.stats24h?.numSells),
                            txns24hTotal: this.safeNum(jup?.stats24h?.numBuys) + this.safeNum(jup?.stats24h?.numSells),
                            txns24hChange: 0,
                            holdersCount: this.safeNum(jup?.holderCount),
                            holdersChange24h: this.safeNum(jup?.stats24h?.holderChange),
                            uniqueWallets24h: this.safeNum(jup?.stats24h?.numTraders),
                            top10Percent: this.safeNum(jup?.audit?.topHoldersPercentage),
                            insiderPercent: 0,
                            mintAuthorityDisabled: jup?.audit?.mintAuthorityDisabled ?? false,
                            freezeAuthorityDisabled: jup?.audit?.freezeAuthorityDisabled ?? false,
                            lpBurnt: false,
                            hasSocialLinks: hasSocial,
                            riskScore: jup?.organicScore != null ? Math.round(Math.max(0, 100 - jup.organicScore)) : 50,
                            riskFactors: [],
                            ageSeconds,
                            priceSparkline: [],
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                    });

                    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                        try {
                            for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
                                await this.tokenRepository.upsert(rows.slice(i, i + UPSERT_CHUNK_SIZE), {
                                    conflictPaths: ["address", "network"],
                                    skipUpdateIfNoValuesChanged: false
                                });
                            }
                            totalInserted += rows.length;
                            break;
                        } catch (error) {
                            if (attempt < MAX_RETRIES) {
                                this.logger.warn(
                                    `[Provisioned sync] Upsert failed (attempt ${attempt}/${MAX_RETRIES}), retrying in 5s... ${
                                        error instanceof Error ? this.formatError(error) : String(error)
                                    }`
                                );
                                await new Promise((r) => setTimeout(r, 5000));
                            } else {
                                this.logger.warn(`[Provisioned sync] Batch failed, retrying row-by-row to isolate errors...`);
                                for (const row of rows) {
                                    try {
                                        await this.tokenRepository.upsert(row, { conflictPaths: ["address", "network"], skipUpdateIfNoValuesChanged: false });
                                        totalInserted++;
                                    } catch (rowError) {
                                        this.logger.error(
                                            `[Provisioned sync] Failed to upsert token ${row.address}: ${
                                                rowError instanceof Error ? this.formatError(rowError) : String(rowError)
                                            }`
                                        );
                                    }
                                }
                            }
                        }
                    }
                }

                this.logger.log(
                    `[Provisioned sync] Progress: ${totalProcessed.toLocaleString()} processed — inserted ${totalInserted.toLocaleString()} new so far...`
                );
            };

            const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });

            for await (const line of rl) {
                const addr = line.trim();
                if (!addr) continue;
                buffer.push(addr);
                if (buffer.length >= BATCH_SIZE) {
                    await processBatch(buffer);
                    buffer = [];
                    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
                }
                if (limit !== undefined && totalProcessed + buffer.length >= limit) break;
            }
            if (buffer.length) await processBatch(buffer);

            this.logger.log(
                `Provisioned token sync complete. Processed ${totalProcessed.toLocaleString()} — inserted ${totalInserted.toLocaleString()} new tokens.`
            );
        } catch (error) {
            this.logger.error("Failed to sync provisioned tokens", error instanceof Error ? error.stack : String(error));
        }
    }

    async syncDbTokens(cluster: Cluster, fromRow?: number, toRow?: number) {
        this.assertMainnet(cluster);
        try {
            const rangeLabel = fromRow != null || toRow != null ? ` (rows ${fromRow ?? 0}–${toRow ?? "end"})` : "";
            this.logger.log(`[DB sync] Starting metadata refresh for all DB tokens${rangeLabel}...`);

            const JUPITER_CHUNK_SIZE = 100;
            const BATCH_SIZE = JUPITER_CHUNK_SIZE * 30;
            const CHUNK_DELAY_MS = 2100;
            const DELAY_MS = 2100;
            const MAX_RETRIES = 3;
            const UPSERT_CHUNK_SIZE = 1500;
            const network = cluster;

            const jupBaseUrl = `${this.configService.get<string>("jupiter.apiUrl")}/tokens/v2/search?query=`;

            const dbTokens = await this.tokenRepository.createQueryBuilder("t").select("t.address").where("t.network = :network", { network }).getMany();
            const allAddresses = dbTokens.map((t) => t.address).slice(fromRow ?? 0, toRow ?? undefined);

            this.logger.log(`[DB sync] Found ${allAddresses.length.toLocaleString()} tokens to refresh (total in DB: ${dbTokens.length.toLocaleString()}).`);

            let totalProcessed = 0;
            let totalUpdated = 0;

            for (let i = 0; i < allAddresses.length; i += BATCH_SIZE) {
                const batchAddresses = allAddresses.slice(i, i + BATCH_SIZE);

                const chunks: string[][] = [];
                for (let j = 0; j < batchAddresses.length; j += JUPITER_CHUNK_SIZE) {
                    chunks.push(batchAddresses.slice(j, j + JUPITER_CHUNK_SIZE));
                }

                const fetchChunk = async (chunk: string[]): Promise<JupiterSeedToken[]> => {
                    const MAX_FETCH_RETRIES = 4;
                    for (let attempt = 1; attempt <= MAX_FETCH_RETRIES; attempt++) {
                        try {
                            const res = await fetch(jupBaseUrl + chunk.join(","));
                            if (res.status === 429) {
                                const backoff = attempt * 5000;
                                this.logger.warn(`[DB sync] Rate limited (429), waiting ${backoff / 1000}s (attempt ${attempt}/${MAX_FETCH_RETRIES})...`);
                                await new Promise((r) => setTimeout(r, backoff));
                                continue;
                            }
                            if (!res.ok) {
                                this.logger.warn(`[DB sync] Jupiter chunk failed: HTTP ${res.status} ${res.statusText}`);
                                return [];
                            }
                            return (await res.json()) as JupiterSeedToken[];
                        } catch (error) {
                            this.logger.warn(`[DB sync] Jupiter chunk error: ${error instanceof Error ? this.formatError(error) : String(error)}`);
                            return [];
                        }
                    }
                    this.logger.warn(`[DB sync] Chunk permanently failed after ${MAX_FETCH_RETRIES} attempts, skipping.`);
                    return [];
                };

                const allResults: JupiterSeedToken[][] = [];
                for (let j = 0; j < chunks.length; j++) {
                    allResults.push(await fetchChunk(chunks[j]));
                    if (j < chunks.length - 1) {
                        await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
                    }
                }
                const results = allResults;
                const jupiterData = results.flat();
                const jupiterMap = new Map<string, JupiterSeedToken>(jupiterData.map((t) => [t.id, t]));
                const notFoundInJupiter = batchAddresses.filter((addr) => !jupiterMap.has(addr));
                if (notFoundInJupiter.length > 0) {
                    this.logger.warn(`[DB sync] Jupiter returned no data for ${notFoundInJupiter.length} token(s) in this batch.`);
                }

                const rows = batchAddresses.map((addr) => {
                    const jup = jupiterMap.get(addr);
                    const hasSocial = !!(jup?.twitter || jup?.telegram || jup?.discord || jup?.website);

                    let ageSeconds = 0;
                    const createdAtSource = jup?.createdAt || jup?.firstPool?.createdAt;
                    if (createdAtSource) {
                        ageSeconds = Math.floor((Date.now() - new Date(createdAtSource).getTime()) / 1000);
                    }

                    return {
                        address: addr,
                        network,
                        symbol: jup?.symbol ?? addr.substring(0, 8),
                        name: jup?.name ?? addr.substring(0, 16),
                        decimals: jup?.decimals ?? 9,
                        logoUri: jup?.icon ?? null,
                        description: jup?.description ?? null,
                        website: jup?.website ?? null,
                        socialLinks: {
                            twitter: jup?.twitter ?? null,
                            telegram: jup?.telegram ?? null,
                            discord: jup?.discord ?? null
                        },
                        totalSupply: this.safeNum(jup?.totalSupply),
                        circulatingSupply: this.safeNum(jup?.circSupply),
                        maxSupply: 0,
                        price: this.safeNum(jup?.usdPrice),
                        priceChange1h: this.safeNum(jup?.stats1h?.priceChange),
                        priceChange24h: this.safeNum(jup?.stats24h?.priceChange),
                        priceChange7d: this.safeNum(jup?.stats7d?.priceChange),
                        marketCap: this.safeNum(jup?.mcap),
                        marketCapChange24h: 0,
                        fdv: this.safeNum(jup?.fdv),
                        liquidity: this.safeNum(jup?.liquidity),
                        liquidityChange24h: this.safeNum(jup?.stats24h?.liquidityChange),
                        volume24h: this.safeNum(jup?.stats24h?.buyVolume) + this.safeNum(jup?.stats24h?.sellVolume),
                        volumeChange24h: this.safeNum(jup?.stats24h?.volumeChange),
                        txns24hBuys: this.safeNum(jup?.stats24h?.numBuys),
                        txns24hSells: this.safeNum(jup?.stats24h?.numSells),
                        txns24hTotal: this.safeNum(jup?.stats24h?.numBuys) + this.safeNum(jup?.stats24h?.numSells),
                        txns24hChange: 0,
                        holdersCount: this.safeNum(jup?.holderCount),
                        holdersChange24h: this.safeNum(jup?.stats24h?.holderChange),
                        uniqueWallets24h: this.safeNum(jup?.stats24h?.numTraders),
                        top10Percent: this.safeNum(jup?.audit?.topHoldersPercentage),
                        insiderPercent: 0,
                        mintAuthorityDisabled: jup?.audit?.mintAuthorityDisabled ?? false,
                        freezeAuthorityDisabled: jup?.audit?.freezeAuthorityDisabled ?? false,
                        lpBurnt: false,
                        hasSocialLinks: hasSocial,
                        riskScore: jup?.organicScore != null ? Math.round(Math.max(0, 100 - jup.organicScore)) : 50,
                        riskFactors: [],
                        ageSeconds,
                        priceSparkline: [],
                        updatedAt: new Date()
                    };
                });

                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        for (let k = 0; k < rows.length; k += UPSERT_CHUNK_SIZE) {
                            await this.tokenRepository.upsert(rows.slice(k, k + UPSERT_CHUNK_SIZE), {
                                conflictPaths: ["address", "network"],
                                skipUpdateIfNoValuesChanged: false
                            });
                        }
                        totalUpdated += rows.length;
                        break;
                    } catch (error) {
                        if (attempt < MAX_RETRIES) {
                            this.logger.warn(
                                `[DB sync] Upsert failed (attempt ${attempt}/${MAX_RETRIES}), retrying in 5s... ${
                                    error instanceof Error ? this.formatError(error) : String(error)
                                }`
                            );
                            await new Promise((r) => setTimeout(r, 5000));
                        } else {
                            this.logger.warn(`[DB sync] Batch at offset ${i} failed, retrying row-by-row to isolate errors...`);
                            for (const row of rows) {
                                try {
                                    await this.tokenRepository.upsert(row, { conflictPaths: ["address", "network"], skipUpdateIfNoValuesChanged: false });
                                    totalUpdated++;
                                } catch (rowError) {
                                    this.logger.error(
                                        `[DB sync] Failed to upsert token ${row.address}: ${
                                            rowError instanceof Error ? this.formatError(rowError) : String(rowError)
                                        }`
                                    );
                                }
                            }
                        }
                    }
                }

                totalProcessed += batchAddresses.length;
                this.logger.log(
                    `[DB sync] Progress: ${totalProcessed.toLocaleString()} / ${allAddresses.length.toLocaleString()} processed, ${totalUpdated.toLocaleString()} updated.`
                );

                if (i + BATCH_SIZE < allAddresses.length) {
                    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
                }
            }

            this.logger.log(`[DB sync] Complete. ${totalUpdated.toLocaleString()} tokens refreshed.`);
        } catch (error) {
            this.logger.error("[DB sync] Failed to sync DB tokens", error instanceof Error ? error.stack : String(error));
        }
    }

    async updateTokenOnChainData(cluster: Cluster) {
        this.assertMainnet(cluster);
        const importantAddresses = [
            "So11111111111111111111111111111111111111112",
            "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "2wpTofQ8SkACrkZWrZDjXPitYa8AwWgX8AfxdeBRRVLX"
        ];

        await this.updateBatchTokens(cluster, importantAddresses);

        const allTokens = await this.tokenRepository.find({ where: { network: cluster } });
        const remainingTokens = allTokens.map((t) => t.address).filter((addr) => !importantAddresses.includes(addr));

        const BATCH_SIZE = 60;
        const DELAY_MS = 70 * 1000;

        for (let i = 0; i < remainingTokens.length; i += BATCH_SIZE) {
            const batch = remainingTokens.slice(i, i + BATCH_SIZE);
            await this.updateBatchTokens(cluster, batch);
            if (i + BATCH_SIZE < remainingTokens.length) {
                this.logger.log(`Waiting ${DELAY_MS / 1000}s before next batch...`);
                await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
            }
        }

        this.logger.log("Completed updating all on-chain token data.");
    }

    private safeNum(val: string | number | null | undefined, fallback = 0): number {
        const n = Number(val);
        return Number.isFinite(n) ? n : fallback;
    }

    private assertMainnet(cluster: Cluster): void {
        if (cluster !== "mainnet") {
            throw new ServiceUnavailableException("Jupiter token seeding is unavailable on devnet.");
        }
    }

    private async updateBatchTokens(cluster: Cluster, addresses: string[]) {
        if (!addresses.length) return;

        try {
            const jupUrl = `${this.configService.get<string>("jupiter.apiUrl")}/tokens/v2/search?query=${addresses.join(",")}`;

            const tokensInfo = (await fetch(jupUrl).then((res) => res.json())) as JupiterSeedToken[];
            if (!tokensInfo?.length) return;

            const existingTokens = await this.tokenRepository.findBy({
                address: In(addresses),
                network: cluster
            });

            const existingMap = new Map(existingTokens.map((t) => [t.address, t]));

            const updates = tokensInfo
                .filter((info) => existingMap.has(info.id))
                .map((info) => {
                    const exist = existingMap.get(info.id)!;

                    return {
                        ...exist,
                        totalSupply: info.totalSupply != null ? this.safeNum(info.totalSupply) : exist.totalSupply,
                        circulatingSupply: info.circSupply != null ? this.safeNum(info.circSupply) : exist.circulatingSupply,
                        price: info.usdPrice != null ? this.safeNum(info.usdPrice) : exist.price,
                        priceChange1h: info.stats1h?.priceChange != null ? this.safeNum(info.stats1h.priceChange) : exist.priceChange1h,
                        priceChange24h: info.stats24h?.priceChange != null ? this.safeNum(info.stats24h.priceChange) : exist.priceChange24h,
                        priceChange7d: info.stats7d?.priceChange != null ? this.safeNum(info.stats7d.priceChange) : exist.priceChange7d,
                        marketCap: info.mcap != null ? this.safeNum(info.mcap) : exist.marketCap,
                        marketCapChange24h:
                            info.stats24h?.priceChange != null && info.circSupply ? this.safeNum(info.stats24h.priceChange) : exist.marketCapChange24h,
                        fdv: info.fdv != null ? this.safeNum(info.fdv) : exist.fdv,
                        liquidity: info.liquidity != null ? this.safeNum(info.liquidity) : exist.liquidity,
                        liquidityChange24h: info.stats24h?.liquidityChange != null ? this.safeNum(info.stats24h.liquidityChange) : exist.liquidityChange24h,
                        volume24h: this.safeNum(info.stats24h?.buyVolume) + this.safeNum(info.stats24h?.sellVolume) || exist.volume24h,
                        volumeChange24h: info.stats24h?.volumeChange != null ? this.safeNum(info.stats24h.volumeChange) : exist.volumeChange24h,
                        mintAuthorityDisabled: info.audit?.mintAuthorityDisabled ?? exist.mintAuthorityDisabled,
                        freezeAuthorityDisabled: info.audit?.freezeAuthorityDisabled ?? exist.freezeAuthorityDisabled,
                        holdersChange24h: info.stats24h?.holderChange != null ? this.safeNum(info.stats24h.holderChange) : exist.holdersChange24h,
                        uniqueWallets24h: info.stats24h?.numTraders != null ? this.safeNum(info.stats24h.numTraders) : exist.uniqueWallets24h,
                        top10Percent: info.audit?.topHoldersPercentage != null ? this.safeNum(info.audit.topHoldersPercentage) : exist.top10Percent,
                        riskScore: info.organicScore != null ? Math.max(0, 100 - info.organicScore) : exist.riskScore,
                        updatedAt: new Date()
                    };
                });

            if (!updates.length) return;
            await this.tokenRepository.upsert(updates, {
                conflictPaths: ["address", "network"],
                skipUpdateIfNoValuesChanged: false
            });
            this.logger.log(`Updated batch of ${addresses.length} tokens.`);
        } catch (error) {
            this.logger.error("Failed to update batch on-chain data", error instanceof Error ? error.stack : String(error));
        }
    }
}
