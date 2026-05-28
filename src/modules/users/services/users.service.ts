import { Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { UsersRepository } from "../repositories/users.repository";
import { CreateUserDto } from "../dtos/create-user.dto";
import { UpdateUserDto } from "../dtos/update-user.dto";
import { UserFilterDto } from "../dtos/user-filter.dto";
import { User, UserRole } from "../entities/user.entity";

@Injectable()
export class UsersService {
    constructor(private readonly usersRepository: UsersRepository) {}

    async findAll(filters: UserFilterDto): Promise<{ users: User[]; total: number; page: number; limit: number }> {
        const { page, limit, ...rest } = filters;
        const [users, total] = await this.usersRepository.findAll(page, limit, rest);
        return { users, total, page, limit };
    }

    async findById(id: string): Promise<User> {
        const user = await this.usersRepository.findById(id);
        if (!user) throw new NotFoundException("User not found");
        return user;
    }

    async create(dto: CreateUserDto): Promise<User> {
        const existingEmail = await this.usersRepository.findByEmail(dto.email);
        if (existingEmail) throw new ConflictException("Email already exists");

        if (dto.username) {
            const existingUsername = await this.usersRepository.findByUsername(dto.username);
            if (existingUsername) throw new ConflictException("Username already exists");
        }

        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = await this.usersRepository.create({ ...dto, password: hashedPassword });
        const { password: _, ...result } = user;
        return result as User;
    }

    async update(id: string, dto: UpdateUserDto): Promise<User> {
        await this.findById(id);
        return this.usersRepository.update(id, dto);
    }

    async delete(id: string): Promise<{ message: string }> {
        await this.findById(id);
        await this.usersRepository.delete(id);
        return { message: "User deleted successfully" };
    }

    async ban(id: string, reason: string): Promise<User> {
        await this.findById(id);
        return this.usersRepository.update(id, { isActive: false, banReason: reason });
    }

    async unban(id: string): Promise<User> {
        await this.findById(id);
        return this.usersRepository.update(id, { isActive: true, banReason: null });
    }

    async changeRole(id: string, role: UserRole): Promise<User> {
        await this.findById(id);
        return this.usersRepository.update(id, { role });
    }

    async getUserWallets(id: string) {
        await this.findById(id);
        return this.usersRepository.getUserWallets(id);
    }

    async getUserSwapStats(id: string) {
        await this.findById(id);
        return this.usersRepository.getUserSwapStats(id);
    }
}
