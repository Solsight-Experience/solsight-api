import { Request } from "express";
import { UserRole } from "src/modules/users/entities/user.entity";
import { User } from "src/modules/users/entities/user.entity";

export interface RequestWithUser {
    user?: {
        role: UserRole;
    };
}

export interface AuthenticatedRequest extends Request {
    user: User;
}
