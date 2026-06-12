import { UserRole } from "src/modules/users/entities/user.entity";

export interface RequestWithUser {
    user?: {
        role: UserRole;
    };
}
