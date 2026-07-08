import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { HeliusResolver } from "../../../../infra/solana/helius.resolver";
import { SolanaService } from "../../../../infra/solana/solana.service";
import { HolderAggregationService } from "./holder-aggregation.service";
import { HolderUpdateEvent } from "../../types/holder-aggregation.types";
import { Holder } from "../../entities/holder.entity";
import { logError } from "src/common/errors/error-helper";
import type { Cluster } from "src/common/cluster/cluster.types";

const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFfZWjUaPwxwnSx5SSw");
const SPL_TOKEN_ACCOUNT_SIZE = 165;
const OWNER_OFFSET = 32;
const OWNER_AMOUNT_SLICE_LENGTH = 40; // owner (32 bytes) + amount (8 bytes)
const MAX_ACCOUNTS = 500_000;

@Injectable()
export class HolderBootstrapService {
    private readonly logger = new Logger(HolderBootstrapService.name);
    private readonly bootstrapInProgress = new Set<string>();

    constructor(
        private readonly heliusResolver: HeliusResolver,
        private readonly solanaService: SolanaService,
        private readonly holderAggregationService: HolderAggregationService,
        @InjectRepository(Holder)
        private readonly holderRepository: Repository<Holder>
    ) {}

    async bootstrap(mint: string, cluster: Cluster): Promise<void> {
        const key = `${cluster}:${mint}`;
        if (this.bootstrapInProgress.has(key)) {
            this.logger.debug(`Bootstrap already in progress for ${mint}`);
            return;
        }

        const existingCount = await this.holderRepository.count({ where: { tokenMint: mint, network: cluster } });
        if (existingCount > 0) {
            this.logger.debug(`Skipping bootstrap for ${mint}: ${existingCount} holders already in DB`);
            return;
        }

        this.bootstrapInProgress.add(key);
        try {
            await this.runBootstrap(mint, cluster);
        } catch (error) {
            logError(this.logger, `Bootstrap failed for ${mint}`, error);
        } finally {
            this.bootstrapInProgress.delete(key);
        }
    }

    private async runBootstrap(mint: string, cluster: Cluster): Promise<void> {
        const rpc = this.heliusResolver.forCluster(cluster);
        const mintPubkey = new PublicKey(mint);
        const now = Date.now();

        const balances = new Map<string, bigint>();

        await this.collectHolders(cluster, mintPubkey, TOKEN_PROGRAM_ID, true, balances);
        await this.collectHolders(cluster, mintPubkey, TOKEN_2022_PROGRAM_ID, false, balances);

        const slot = await rpc.getSlot();

        const sorted = Array.from(balances.entries())
            .filter(([, bal]) => bal > 0n)
            .sort(([, a], [, b]) => (b > a ? 1 : b < a ? -1 : 0));

        this.logger.log(`Bootstrapping ${sorted.length} holders for ${mint}`);

        for (const [wallet, balance] of sorted) {
            const balanceNum = Number(balance);
            const event: HolderUpdateEvent = {
                network: cluster,
                mint,
                wallet,
                balance: balanceNum,
                balance_change: balanceNum,
                last_active_slot: slot,
                last_active_ts: Math.floor(now / 1000),
                slot,
                signature: "bootstrap",
                is_new_holder: true,
                is_removed: false,
                rank: null,
                total_bought_raw: 0,
                total_sold_raw: 0,
                total_bought_usd: 0,
                total_sold_usd: 0,
                buy_tx_count: 0,
                sell_tx_count: 0
            };
            await this.holderAggregationService.onHolderUpdate(event);
        }

        this.logger.log(`Bootstrap complete: ${sorted.length} holders written for ${mint}`);
    }

    private async collectHolders(cluster: Cluster, mint: PublicKey, programId: PublicKey, fixedSize: boolean, balances: Map<string, bigint>): Promise<void> {
        const filters: GetProgramAccountsFilter[] = [{ memcmp: { offset: 0, bytes: mint.toBase58() } }];
        if (fixedSize) {
            filters.push({ dataSize: SPL_TOKEN_ACCOUNT_SIZE });
        }

        try {
            const accounts = await this.solanaService.getProgramAccountsFiltered(cluster, programId, filters, {
                dataSlice: { offset: OWNER_OFFSET, length: OWNER_AMOUNT_SLICE_LENGTH },
                commitment: "confirmed"
            });

            const capped = accounts.slice(0, MAX_ACCOUNTS);
            if (accounts.length > MAX_ACCOUNTS) {
                this.logger.warn(`Bootstrap: ${accounts.length} accounts for ${mint.toBase58()}, capped at ${MAX_ACCOUNTS}`);
            }

            for (const { account } of capped) {
                try {
                    const buf = account.data;
                    if (buf.length < 40) continue;

                    const owner = new PublicKey(buf.subarray(0, 32)).toBase58();
                    const amount = buf.readBigUInt64LE(32);

                    balances.set(owner, (balances.get(owner) ?? 0n) + amount);
                } catch {
                    // skip malformed accounts
                }
            }
        } catch (error) {
            logError(this.logger, `getProgramAccounts failed for program ${programId.toBase58()}`, error);
        }
    }
}
