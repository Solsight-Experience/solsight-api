import type { Repository } from "typeorm";
import { FeatureUsage } from "../entities/feature-usage.entity";
import { UserCredit } from "../entities/user-credit.entity";
import { FREE_DAILY_QUOTA_LIMIT, QuotaService } from "./quota.service";

// Mock ".query()" mô phỏng đúng semantics atomic của câu SQL thật (check-and-mutate
// trong 1 lần gọi, không có await ở giữa) — đây là điều Postgres đảm bảo qua row lock
// khi nhiều request cùng UPSERT/UPDATE trên cùng key; test verify logic service đọc
// đúng kết quả "có row / không có row" để enforce giới hạn, không test lock của Postgres.
function createFeatureUsageRepositoryMock(initialCount = 0) {
    const state = { count: initialCount, exists: initialCount > 0 };
    const query = jest.fn((_sql: string, params: unknown[]) => {
        const [, , amount, limit] = params as [string, string, number, number];
        if (!state.exists) {
            state.exists = true;
            state.count = Math.min(amount, limit);
            return Promise.resolve([{ count: state.count }]);
        }
        if (state.count + amount <= limit) {
            state.count += amount;
            return Promise.resolve([{ count: state.count }]);
        }
        return Promise.resolve([]);
    });
    const findOne = jest.fn(() => Promise.resolve(state.exists ? { count: state.count } : null));
    return { repo: { query, findOne } as unknown as jest.Mocked<Repository<FeatureUsage>>, state };
}

function createUserCreditRepositoryMock(initialBalance = 0) {
    const state = { balance: initialBalance };
    const findOne = jest.fn(() => Promise.resolve({ balance: state.balance }));
    // UPDATE...RETURNING trả về tuple [rows, rowCount], không phải rows trực tiếp.
    const query = jest.fn((sql: string, params: unknown[]) => {
        const [amount] = params as [number, string];
        if (sql.includes('"balance" + $1')) {
            state.balance += amount;
            return Promise.resolve([[{ balance: state.balance }], 1]);
        }
        if (state.balance >= amount) {
            state.balance -= amount;
            return Promise.resolve([[{ balance: state.balance }], 1]);
        }
        return Promise.resolve([[], 0]);
    });
    return { repo: { query, findOne } as unknown as jest.Mocked<Repository<UserCredit>>, state };
}

describe("QuotaService.consumeQuota", () => {
    it("allows at most FREE_DAILY_QUOTA_LIMIT free uses per user per day under concurrent requests", async () => {
        const featureUsage = createFeatureUsageRepositoryMock();
        const userCredit = createUserCreditRepositoryMock(0);
        const service = new QuotaService(featureUsage.repo, userCredit.repo);

        const attempts = FREE_DAILY_QUOTA_LIMIT + 5;
        const results = await Promise.all(Array.from({ length: attempts }, () => service.consumeQuota("user-1")));

        const allowedFree = results.filter((r) => r.allowed && r.source === "free");
        const denied = results.filter((r) => !r.allowed);

        expect(allowedFree).toHaveLength(FREE_DAILY_QUOTA_LIMIT);
        expect(denied).toHaveLength(attempts - FREE_DAILY_QUOTA_LIMIT);
    });

    it("falls back to paid credits once free quota is exhausted, and never over-spends the balance", async () => {
        const featureUsage = createFeatureUsageRepositoryMock(FREE_DAILY_QUOTA_LIMIT); // free already used up today
        const userCredit = createUserCreditRepositoryMock(3);
        const service = new QuotaService(featureUsage.repo, userCredit.repo);

        const results = await Promise.all(Array.from({ length: 5 }, () => service.consumeQuota("user-1")));

        const allowedPaid = results.filter((r) => r.allowed && r.source === "paid");
        const denied = results.filter((r) => !r.allowed);

        expect(allowedPaid).toHaveLength(3);
        expect(denied).toHaveLength(2);
        expect(userCredit.state.balance).toBe(0);
    });

    it("denies the request without side effects when both free quota and paid balance are exhausted", async () => {
        const featureUsage = createFeatureUsageRepositoryMock(FREE_DAILY_QUOTA_LIMIT);
        const userCredit = createUserCreditRepositoryMock(0);
        const service = new QuotaService(featureUsage.repo, userCredit.repo);

        const result = await service.consumeQuota("user-1");

        expect(result).toEqual({ allowed: false });
    });
});

describe("QuotaService.refundQuota", () => {
    it("credits back a paid usage", async () => {
        const featureUsage = createFeatureUsageRepositoryMock();
        const userCredit = createUserCreditRepositoryMock(0);
        const service = new QuotaService(featureUsage.repo, userCredit.repo);

        await service.refundQuota("user-1", "paid");

        expect(userCredit.state.balance).toBe(1);
    });
});

describe("QuotaService.hasQuotaAvailable", () => {
    it("is a non-mutating check — does not consume anything", async () => {
        const featureUsage = createFeatureUsageRepositoryMock(FREE_DAILY_QUOTA_LIMIT - 1);
        const userCredit = createUserCreditRepositoryMock(0);
        const service = new QuotaService(featureUsage.repo, userCredit.repo);

        await expect(service.hasQuotaAvailable("user-1")).resolves.toBe(true);
        expect(featureUsage.state.count).toBe(FREE_DAILY_QUOTA_LIMIT - 1);
    });

    it("is true when paid credits remain after free quota is exhausted", async () => {
        const featureUsage = createFeatureUsageRepositoryMock(FREE_DAILY_QUOTA_LIMIT);
        const userCredit = createUserCreditRepositoryMock(1);
        const service = new QuotaService(featureUsage.repo, userCredit.repo);

        await expect(service.hasQuotaAvailable("user-1")).resolves.toBe(true);
    });

    it("is false when both free quota and paid balance are exhausted", async () => {
        const featureUsage = createFeatureUsageRepositoryMock(FREE_DAILY_QUOTA_LIMIT);
        const userCredit = createUserCreditRepositoryMock(0);
        const service = new QuotaService(featureUsage.repo, userCredit.repo);

        await expect(service.hasQuotaAvailable("user-1")).resolves.toBe(false);
    });
});
