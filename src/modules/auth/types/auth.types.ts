export interface LoginDto {
    email: string;
    password: string;
}

export interface RegisterDto {
    email: string;
    username?: string;
    password: string;
    firstName?: string;
    lastName?: string;
}

export interface OauthLoginDto {
    provider: "google";
    token: string;
}

export interface JwtPayload {
    sub: string;
    email: string;
    username: string;
}

export interface GoogleTokenProfile {
    email: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    sub: string;
}

export interface DatabaseError extends Error {
    code?: string;
    detail?: string;
}

export interface CookieRequest {
    cookies: {
        auth_token?: string;
    };
}
