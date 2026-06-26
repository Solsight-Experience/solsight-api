export interface PendingRegistration {
    email: string;
    password: string;
    username: string;
    firstName?: string;
    lastName?: string;
    token: string;
}
