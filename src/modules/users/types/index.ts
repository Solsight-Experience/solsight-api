import { UserRole } from "../entities/user.entity";

export interface UserFilters {
    search?: string;
    role?: UserRole;
    isActive?: boolean;
}
