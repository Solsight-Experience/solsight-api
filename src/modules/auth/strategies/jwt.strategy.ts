import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { AuthService, JwtPayload } from "../services/auth.service";

interface CookieRequest {
    cookies: {
        auth_token?: string;
    };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private readonly authService: AuthService,
        configService: ConfigService
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                (request: CookieRequest) => {
                    // console.log('All cookies:', request?.cookies);
                    const token = request.cookies?.auth_token;
                    // console.log('Extracted auth_token from cookie:', token);
                    return token ?? null;
                },
                ExtractJwt.fromAuthHeaderAsBearerToken()
            ]),
            secretOrKey: configService.getOrThrow<string>("jwt.secret")
        });
    }

    async validate(payload: JwtPayload) {
        const user = await this.authService.validateUserByToken(payload);
        if (!user) throw new UnauthorizedException();
        return user;
    }
}
