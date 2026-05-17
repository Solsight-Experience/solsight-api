import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User, UserRole } from "../entities/user.entity";
import { CreateUserDto } from "../dtos/create-user.dto";

interface UserFilters {
    search?: string;
    role?: UserRole;
    isActive?: boolean;
}

@Injectable()
export class UsersRepository {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>
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
        await this.userRepository.update(id, updateData);
        return (await this.findById(id))!;
    }

    async delete(id: string): Promise<void> {
        await this.userRepository.delete(id);
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
