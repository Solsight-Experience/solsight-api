import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FeatureUsage } from "../entities/feature-usage.entity";
import { UserCredit } from "../entities/user-credit.entity";
import { QuotaConsumptionResult, QuotaStatus } from "../types/billing.types";

export const FREE_DAILY_QUOTA_LIMIT = 10;

// Ngày quota tính theo giờ Việt Nam (UTC+7), reset lúc 00:00 UTC+7 — không rollover.
function getUsageDateUtc7(): string {
    return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getNextResetAtUtc7(): string {
    const utc7Now = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const nextMidnightUtc7 = new Date(Date.UTC(utc7Now.getUTCFullYear(), utc7Now.getUTCMonth(), utc7Now.getUTCDate() + 1));
    return new Date(nextMidnightUtc7.getTime() - 7 * 60 * 60 * 1000).toISOString();
}

@Injectable()
export class QuotaService {
    constructor(
        @InjectRepository(FeatureUsage)
        private readonly featureUsageRepository: Repository<FeatureUsage>,
        @InjectRepository(UserCredit)
        private readonly userCreditRepository: Repository<UserCredit>
    ) {}

    // Trừ free quota trước, hết free mới trừ paid credits. Cả hai bước atomic
    // nhờ điều kiện WHERE ngay trong statement — Postgres tự serialize các
    // request đồng thời cùng key qua row lock, không cần transaction Node-side.
    async consumeQuota(userId: string, amount = 1): Promise<QuotaConsumptionResult> {
        const usageDate = getUsageDateUtc7();

        const freeRows = await this.featureUsageRepository.query<Array<{ count: number }>>(
            `INSERT INTO feature_usage ("userId", "usageDate", "count")
             VALUES ($1, $2, LEAST($3::integer, $4::integer))
             ON CONFLICT ("userId", "usageDate") DO UPDATE SET "count" = feature_usage."count" + $3
             WHERE feature_usage."count" + $3 <= $4
             RETURNING "count"`,
            [userId, usageDate, amount, FREE_DAILY_QUOTA_LIMIT]
        );
        if (freeRows.length > 0) {
            return { allowed: true, source: "free" };
        }

        // manager.query() trên UPDATE trả về tuple [rows, rowCount] chứ không phải rows
        // trực tiếp (khác với INSERT) — phải destructure đúng, nếu không rows.length
        // luôn = 2 (truthy) bất kể WHERE có match hàng nào không.
        const [paidRows] = await this.userCreditRepository.query<[Array<{ balance: number }>, number]>(
            `UPDATE user_credits SET "balance" = "balance" - $1, "updatedAt" = NOW()
             WHERE "userId" = $2 AND "balance" >= $1
             RETURNING "balance"`,
            [amount, userId]
        );
        if (paidRows.length > 0) {
            return { allowed: true, source: "paid" };
        }

        return { allowed: false };
    }

    // Dùng khi handler tính năng lỗi 500 SAU KHI đã trừ quota. Với paid credits
    // đây là bắt buộc (là tiền của user); với free chỉ để hiển thị đúng số liệu.
    async refundQuota(userId: string, source: "free" | "paid", amount = 1): Promise<void> {
        if (source === "free") {
            const usageDate = getUsageDateUtc7();
            await this.featureUsageRepository.query(`UPDATE feature_usage SET "count" = GREATEST("count" - $1, 0) WHERE "userId" = $2 AND "usageDate" = $3`, [
                amount,
                userId,
                usageDate
            ]);
            return;
        }

        await this.userCreditRepository.query(`UPDATE user_credits SET "balance" = "balance" + $1, "updatedAt" = NOW() WHERE "userId" = $2`, [amount, userId]);
    }

    // Kiểm tra không mutate state — dùng để chặn sớm trước khi gọi AI (tránh tốn
    // chi phí AI cho request chắc chắn bị từ chối). Việc trừ quota thật chỉ xảy ra
    // ở consumeQuota(), gọi SAU KHI AI phản hồi thành công.
    async hasQuotaAvailable(userId: string): Promise<boolean> {
        const status = await this.getQuotaStatus(userId);
        return status.freeUsed < status.freeLimit || status.paidCredits > 0;
    }

    async getQuotaStatus(userId: string): Promise<QuotaStatus> {
        const usageDate = getUsageDateUtc7();
        const [usage, credit] = await Promise.all([
            this.featureUsageRepository.findOne({ where: { userId, usageDate } }),
            this.userCreditRepository.findOne({ where: { userId } })
        ]);

        return {
            freeUsed: usage?.count ?? 0,
            freeLimit: FREE_DAILY_QUOTA_LIMIT,
            paidCredits: credit?.balance ?? 0,
            resetsAt: getNextResetAtUtc7()
        };
    }
}
