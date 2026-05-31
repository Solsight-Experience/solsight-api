import { WalletsService } from "../../wallets/services/wallets.service";
import * as nacl from "tweetnacl";
import bs58 from "bs58";
import * as crypto from "crypto";

// src/auth/services/auth.service.ts
import { BadRequestException, Injectable, Logger, UnauthorizedException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UserRepository } from "../repositories/user.repository";
import { randomBytes } from "crypto";
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

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly userRepository: UserRepository,
        private readonly jwtService: JwtService,
        private readonly walletsService: WalletsService
    ) {}

    // --- Email/Password login ---
    async login(loginDto: LoginDto) {
        const user = await this.userRepository.findActiveByEmailWithPassword(loginDto.email);

        if (!user) throw new BadRequestException("Email not found or inactive");
        if (!user.password) {
            throw new BadRequestException("Invalid account configuration. Please contact support.");
        }

        const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
        if (!isPasswordValid) throw new BadRequestException("Password is incorrect");

        const accessToken = await this.generateAccessToken(user);
        const { password, ...userWithoutPassword } = user;
        return { user: userWithoutPassword, accessToken };
    }

    async handleOauthLogin(dto: OauthLoginDto) {
        const { provider, token } = dto;

        if (provider !== "google") {
            throw new BadRequestException("Unsupported provider");
        }

        try {
            // Verify Google token
            const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);

            if (!googleRes.ok) {
                const errorText = await googleRes.text();
                this.logger.error("Google API error:", errorText);
                throw new BadRequestException("Invalid Google token");
            }

            const profile = await googleRes.json();
            this.logger.log(`Google profile: ${JSON.stringify(profile)}`);

            if (!profile.email) {
                throw new BadRequestException("Invalid Google token - no email");
            }

            // Check if user exists
            let user = await this.userRepository.findByEmail(profile.email);

            if (!user) {
                this.logger.log("Creating new OAuth user...");
                const dummyPassword = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
                const username = profile.name ? profile.name.replace(/\s+/g, "_").toLowerCase() : profile.email.split("@")[0];

                try {
                    user = await this.userRepository.create({
                        email: profile.email,
                        username: username,
                        password: dummyPassword,
                        firstName: profile.given_name,
                        lastName: profile.family_name,
                        avatar: profile.picture,
                        oauthProvider: "google",
                        oauthId: profile.sub,
                        isActive: true,
                        isEmailVerified: true
                        // KHÔNG set password - để undefined
                    });

                    this.logger.log(`OAuth user created: ${user.id}`);
                } catch (dbError) {
                    this.logger.error(`Database error: ${dbError}`);
                    this.logger.error(`Error code: ${dbError.code}`);
                    this.logger.error(`Error detail: ${dbError.detail}`);
                    throw new BadRequestException(`Failed to create user: ${dbError.message}`);
                }
            } else {
                this.logger.log(`Existing user found: ${user.id}`);
            }

            const accessToken = await this.generateAccessToken(user);
            const { password, ...userWithoutPassword } = user;

            return { user: userWithoutPassword, accessToken };
        } catch (error) {
            this.logger.error(`OAuth login error: ${error}`);

            if (error instanceof BadRequestException) {
                throw error;
            }

            throw new BadRequestException(`OAuth login failed: ${error.message}`);
        }
    }

    // --- Register ---
    async register(registerDto: RegisterDto) {
        const emailExists = await this.userRepository.existsByEmail(registerDto.email);
        if (emailExists) throw new BadRequestException("Email already exists");

        const hashedPassword = await bcrypt.hash(registerDto.password, 10);
        const newUser = await this.userRepository.create({
            email: registerDto.email,
            username: registerDto.username || registerDto.email.split("@")[0],
            password: hashedPassword,
            firstName: registerDto.firstName,
            lastName: registerDto.lastName,
            isActive: true,
            isEmailVerified: false
        });

        const accessToken = await this.generateAccessToken(newUser);
        const { password, ...userWithoutPassword } = newUser;
        return { user: userWithoutPassword, accessToken };
    }

    // --- JWT ---
    async generateAccessToken(user: any): Promise<string> {
        const payload: JwtPayload = {
            sub: user.id,
            email: user.email,
            username: user.username
        };
        return this.jwtService.signAsync(payload);
    }

    async validateUserByToken(payload: JwtPayload) {
        const user = await this.userRepository.findById(payload.sub);
        if (!user || !user.isActive) throw new UnauthorizedException("Invalid token");
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    async getSolanaNonce(walletAddress: string): Promise<{ nonce: string }> {
        const wallet = await this.walletsService.findOneByAddress(walletAddress);
        const nonce = crypto.randomUUID();

        if (wallet) {
            await this.walletsService.updateNonce(wallet.id, nonce);
        } else {
            await this.walletsService.createWithNonce(walletAddress, nonce);
        }

        return { nonce };
    }

    async verifySolanaWallet(
        walletAddress: string,
        signature: string,
        message: string,
        walletIcon: string | undefined,
        userId: string
    ): Promise<{ success: boolean; message: string }> {
        const wallet = await this.walletsService.findByAddress(walletAddress);

        if (!wallet || !wallet.nonce) {
            throw new BadRequestException("Wallet not found or nonce not generated");
        }

        if (!wallet.nonceExpiresAt || wallet.nonceExpiresAt.getTime() < Date.now()) {
            await this.walletsService.updateNonce(wallet.id, null);
            throw new UnauthorizedException("Nonce expired. Please request a new one.");
        }

        // TODO: validate parsed.domain against an allowlist (e.g. CORS_ORIGIN host) in a follow-up PR
        const parsed = this.parseSiwsMessage(message);

        if (parsed.address !== walletAddress) {
            throw new UnauthorizedException("SIWS address mismatch");
        }

        if (parsed.nonce !== wallet.nonce) {
            throw new UnauthorizedException("SIWS nonce mismatch");
        }

        if (parsed.version !== "1") {
            throw new BadRequestException("Unsupported SIWS version");
        }

        if (parsed.chainId !== "solana:mainnet" && parsed.chainId !== "solana:devnet") {
            throw new BadRequestException("Invalid SIWS chain ID");
        }

        const issuedAtMs = new Date(parsed.issuedAt).getTime();
        if (Number.isNaN(issuedAtMs)) {
            throw new BadRequestException("Invalid SIWS issuedAt");
        }
        const skewMs = 5 * 60 * 1000;
        const now = Date.now();
        if (issuedAtMs > now + skewMs || issuedAtMs < now - skewMs) {
            throw new UnauthorizedException("SIWS message issuedAt out of acceptable window");
        }

        try {
            const signatureUint8 = bs58.decode(signature);
            const messageUint8 = new TextEncoder().encode(message);
            const publicKeyUint8 = bs58.decode(walletAddress);

            const verified = nacl.sign.detached.verify(messageUint8, signatureUint8, publicKeyUint8);

            if (!verified) {
                throw new UnauthorizedException("Invalid signature");
            }
        } catch (error) {
            if (error instanceof UnauthorizedException) throw error;
            throw new UnauthorizedException("Signature verification failed");
        }

        await this.walletsService.updateNonce(wallet.id, null);

        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new NotFoundException("User not found");
        }

        await this.walletsService.updateUser(wallet.id, user.id, walletIcon);

        return {
            success: true,
            message: "Wallet verified and linked successfully"
        };
    }

    private parseSiwsMessage(message: string): {
        domain: string;
        address: string;
        uri: string;
        version: string;
        chainId: string;
        nonce: string;
        issuedAt: string;
    } {
        const lines = message.split("\n");
        const domainLine = lines[0] || "";
        const domainMatch = domainLine.match(/^(.+?) wants you to sign in/);
        if (!domainMatch) throw new BadRequestException("Malformed SIWS message: missing domain line");
        const domain = domainMatch[1].trim();

        const address = (lines[1] || "").trim();
        if (!address) throw new BadRequestException("Malformed SIWS message: missing address line");

        const fieldRegex = (key: string) => new RegExp(`^${key}:\\s*(.+)$`, "m");
        const extract = (key: string): string => {
            const m = message.match(fieldRegex(key));
            if (!m) throw new BadRequestException(`Malformed SIWS message: missing ${key}`);
            return m[1].trim();
        };

        return {
            domain,
            address,
            uri: extract("URI"),
            version: extract("Version"),
            chainId: extract("Chain ID"),
            nonce: extract("Nonce"),
            issuedAt: extract("Issued At")
        };
    }
}
