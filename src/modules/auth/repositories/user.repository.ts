// src/auth/repositories/user.repository.ts
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../users/entities/user.entity";

@Injectable()
export class UserRepository {
    constructor(
        @InjectRepository(User)
        private readonly repository: Repository<User>
    ) {}

    /**
     * Tìm user theo email
     */
    async findByEmail(email: string): Promise<User | null> {
        return this.repository.findOne({ where: { email } });
    }

    /**
     * Tìm user theo ID
     */
    async findById(id: string): Promise<User | null> {
        return this.repository.findOne({ where: { id } });
    }

    /**
     * Tìm user active theo email
     */
    async findActiveByEmailWithPassword(email: string): Promise<User | null> {
        return this.repository.findOne({
            where: { email, isActive: true },
            select: ["id", "email", "username", "password", "firstName", "lastName", "isActive", "isEmailVerified", "role"]
        });
    }

    /**
     * Tạo user mới
     */
    async create(userData: Partial<User>): Promise<User> {
        const user = this.repository.create(userData);
        return this.repository.save(user);
    }

    /**
     * Cập nhật user
     */
    async update(id: string, userData: Partial<User>): Promise<User | null> {
        const user = await this.findById(id);
        if (!user) return null;
        this.repository.merge(user, userData);
        return this.repository.save(user);
    }

    /**
     * Xóa user (soft delete)
     */
    async softDelete(id: string): Promise<void> {
        const user = await this.findById(id);
        if (!user) return;
        user.isActive = false;
        await this.repository.save(user);
    }

    /**
     * Xóa user (hard delete)
     */
    async delete(id: string): Promise<void> {
        await this.repository.delete(id);
    }

    /**
     * Kiểm tra email đã tồn tại chưa
     */
    async existsByEmail(email: string): Promise<boolean> {
        const count = await this.repository.count({ where: { email } });
        return count > 0;
    }
}
