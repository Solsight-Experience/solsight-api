import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../entities/user.entity";
import { Wallet } from "../../wallets/entities/wallet.entity";
import { SwapExecution } from "../../admin-analytics/entities/swap-execution.entity";
import { CreateUserDto } from "../dtos/create-user.dto";
import { UserFilters } from "../types";

@Injectable()
export class UsersRepository {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Wallet)
        private readonly walletRepository: Repository<Wallet>,
        @InjectRepository(SwapExecution)
        private readonly swapExecutionRepository: Repository<SwapExecution>
    ) {}

    async create(createUserDto: Partial<CreateUserDto> & Partial<User>): Promise<User> {
        const user = this.userRepository.create(createUserDto);
        return this.userRepository.save(user);
    }

    async findById(id: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { id }, relations: ["wallets"] });
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.userRepository.findOne({
            where: { email },
            select: ["id", "email", "username", "password", "isActive", "isEmailVerified"]
        });
    }

    async findByUsername(username: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { username } });
    }

    async findByEmailVerificationToken(token: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { emailVerificationToken: token } });
    }

    async findByPasswordResetToken(token: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { passwordResetToken: token } });
    }

    async update(id: string, updateData: Partial<User>): Promise<User> {
        const user = await this.findById(id);
        if (!user) {
            throw new Error(`User ${id} not found`);
        }
        this.userRepository.merge(user, updateData);
        return this.userRepository.save(user);
    }

    async delete(id: string): Promise<void> {
        await this.userRepository.delete(id);
    }

    async getUserWallets(
        userId: string
    ): Promise<Pick<Wallet, "id" | "address" | "chain" | "type" | "name" | "balance" | "isActive" | "isVerified" | "isDefault" | "createdAt">[]> {
        return this.walletRepository
            .createQueryBuilder("w")
            .select(["w.id", "w.address", "w.chain", "w.type", "w.name", "w.balance", "w.isActive", "w.isVerified", "w.isDefault", "w.createdAt"])
            .where("w.userId = :userId", { userId })
            .orderBy("w.createdAt", "DESC")
            .getMany();
    }

    async getUserSwapStats(userId: string): Promise<{ totalSwaps: number; totalVolumeUsd: number; firstSwapAt: Date | null; lastSwapAt: Date | null }> {
        const result = await this.swapExecutionRepository
            .createQueryBuilder("se")
            .select("COUNT(*)", "totalSwaps")
            .addSelect("COALESCE(SUM(se.volumeUsd), 0)", "totalVolumeUsd")
            .addSelect("MIN(se.createdAt)", "firstSwapAt")
            .addSelect("MAX(se.createdAt)", "lastSwapAt")
            .where("se.userId = :userId", { userId })
            .getRawOne<{ totalSwaps: string; totalVolumeUsd: string; firstSwapAt: Date | null; lastSwapAt: Date | null }>();

        return {
            totalSwaps: parseInt(result?.totalSwaps ?? "0", 10),
            totalVolumeUsd: parseFloat(result?.totalVolumeUsd ?? "0") || 0,
            firstSwapAt: result?.firstSwapAt ?? null,
            lastSwapAt: result?.lastSwapAt ?? null
        };
    }

    async findAll(page: number, limit: number, filters: UserFilters = {}): Promise<[User[], number]> {
        const qb = this.userRepository
            .createQueryBuilder("user")
            .leftJoinAndSelect("user.wallets", "wallet")
            .orderBy("user.createdAt", "DESC")
            .skip((page - 1) * limit)
            .take(limit);

        if (filters.search) {
            qb.andWhere("(LOWER(user.email) LIKE LOWER(:search) OR LOWER(user.username) LIKE LOWER(:search))", { search: `%${filters.search}%` });
        }
        if (filters.role !== undefined) {
            qb.andWhere("user.role = :role", { role: filters.role });
        }
        if (filters.isActive !== undefined) {
            qb.andWhere("user.isActive = :isActive", { isActive: filters.isActive });
        }

        return qb.getManyAndCount();
    }
}
