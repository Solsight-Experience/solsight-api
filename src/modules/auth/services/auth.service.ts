import { WalletsService } from "../../wallets/services/wallets.service";
import * as nacl from "tweetnacl";
import bs58 from "bs58";
import * as crypto from "crypto";

// src/auth/services/auth.service.ts
import { BadRequestException, Injectable, Logger, UnauthorizedException, NotFoundException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UserRepository } from "../repositories/user.repository";
import { randomBytes } from "crypto";
import { User } from "../../users/entities/user.entity";
import { WalletIcon } from "../../wallets/entities/wallet.entity";
import { DatabaseError, GoogleTokenProfile, JwtPayload, LoginDto, OauthLoginDto, RegisterDto } from "../types/auth.types";
import { EmailSenderService } from "../../email/services/sender-service";
import { Templates } from "../../email/services/sender-service/template-store";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly userRepository: UserRepository,
        private readonly jwtService: JwtService,
        private readonly walletsService: WalletsService,
        private readonly emailSenderService: EmailSenderService,
        private readonly configService: ConfigService
    ) {}

    // --- Email/Password login ---
    async login(loginDto: LoginDto) {
        const user = await this.userRepository.findActiveByEmailWithPassword(loginDto.email);

        if (!user) throw new BadRequestException("Email not found or inactive");
        if (!user.password) {
            throw new BadRequestException("Invalid account configuration. Please contact support.");
        }

        const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
        if (!isPasswordValid) throw new UnauthorizedException("Password is incorrect");

        if (!user.isEmailVerified) throw new UnauthorizedException("Please verify your email before logging in");

        void this.userRepository.update(user.id, { lastLoginAt: new Date() });
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

            const profile = (await googleRes.json()) as GoogleTokenProfile;
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
                } catch (error) {
                    const dbError = error as DatabaseError;
                    this.logger.error(`Database error: ${dbError.message}`);
                    this.logger.error(`Error code: ${dbError.code}`);
                    this.logger.error(`Error detail: ${dbError.detail}`);
                    throw new BadRequestException(`Failed to create user: ${dbError.message}`);
                }
            } else {
                this.logger.log(`Existing user found: ${user.id}`);
            }

            void this.userRepository.update(user.id, { lastLoginAt: new Date() });
            const accessToken = await this.generateAccessToken(user);
            const { password, ...userWithoutPassword } = user;

            return { user: userWithoutPassword, accessToken };
        } catch (error) {
            this.logger.error(`OAuth login error: ${error}`);

            if (error instanceof BadRequestException) {
                throw error;
            }

            throw new BadRequestException(`OAuth login failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // --- Register ---
    async register(registerDto: RegisterDto) {
        const emailExists = await this.userRepository.existsByEmail(registerDto.email);
        if (emailExists) throw new ConflictException("Email already exists");

        const hashedPassword = await bcrypt.hash(registerDto.password, 10);
        const verificationToken = randomBytes(32).toString("hex");
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await this.userRepository.create({
            email: registerDto.email,
            username: registerDto.username || registerDto.email.split("@")[0],
            password: hashedPassword,
            firstName: registerDto.firstName,
            lastName: registerDto.lastName,
            isActive: true,
            isEmailVerified: false,
            emailVerificationToken: verificationToken,
            emailVerificationTokenExpires: verificationExpires
        });

        const clientBaseUrl = this.configService.get<string>("email.verifyBaseUrl");
        const verificationUrl = `${clientBaseUrl}/verify-email?token=${verificationToken}`;

        if (this.emailSenderService.hasKey) {
            await this.emailSenderService.sendWithTemplate(
                { to: registerDto.email, subject: "Verify your SolSight account" },
                Templates.VERIFICATION([verificationUrl])
            );
        }

        return { message: "Registration successful. Please check your email to verify your account." };
    }

    async verifyEmail(token: string) {
        const user = await this.userRepository.findByEmailVerificationToken(token);
        if (!user) throw new BadRequestException("Invalid verification token");

        if (!user.emailVerificationTokenExpires || user.emailVerificationTokenExpires < new Date()) {
            throw new BadRequestException("Verification token has expired");
        }

        await this.userRepository.update(user.id, {
            isEmailVerified: true,
            emailVerificationToken: null,
            emailVerificationTokenExpires: null
        });

        return { message: "Email verified successfully. You can now log in." };
    }

    async resendVerificationEmail(email: string) {
        const user = await this.userRepository.findByEmail(email);
        if (!user) throw new NotFoundException("User not found");
        if (user.isEmailVerified) throw new BadRequestException("Email is already verified");

        const verificationToken = randomBytes(32).toString("hex");
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await this.userRepository.update(user.id, {
            emailVerificationToken: verificationToken,
            emailVerificationTokenExpires: verificationExpires
        });

        const clientBaseUrl = this.configService.get<string>("email.verifyBaseUrl");
        const verificationUrl = `${clientBaseUrl}/verify-email?token=${verificationToken}`;

        await this.emailSenderService.sendWithTemplate({ to: email, subject: "Verify your SolSight account" }, Templates.VERIFICATION([verificationUrl]));

        return { message: "Verification email sent. Please check your inbox." };
    }

    // --- JWT ---
    async generateAccessToken(user: User): Promise<string> {
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
        walletIcon?: WalletIcon,
        userId?: string
    ): Promise<{ success: boolean; message: string }> {
        const wallet = await this.walletsService.findByAddress(walletAddress);

        if (!wallet || !wallet.nonce) {
            throw new BadRequestException("Wallet not found or nonce not generated");
        }

        try {
            const signatureUint8 = bs58.decode(signature);
            const nonceUint8 = new TextEncoder().encode(wallet.nonce);
            const publicKeyUint8 = bs58.decode(walletAddress);

            const verified = nacl.sign.detached.verify(nonceUint8, signatureUint8, publicKeyUint8);

            if (!verified) {
                throw new UnauthorizedException("Invalid signature");
            }
        } catch {
            throw new UnauthorizedException("Signature verification failed");
        }

        // Clear nonce
        await this.walletsService.updateNonce(wallet.id, null);

        let user: User | null;
        if (userId) {
            // Scenario A: Linking
            user = await this.userRepository.findById(userId);
            if (!user) {
                throw new NotFoundException("User not found");
            }
        } else {
            // Scenario B: Login
            if (wallet.user) {
                user = wallet.user;
            } else {
                throw new NotFoundException("User not found");
            }
        }

        if (!user) {
            throw new NotFoundException("User not found");
        }

        // if (!wallet.userId || wallet.userId !== user.id) {
        await this.walletsService.updateUser(wallet.id, user.id, walletIcon);
        // }

        return {
            success: true,
            message: "Wallet verified and linked successfully"
        };
    }

    async loginWithSolana(walletAddress: string, signature: string, walletIcon?: WalletIcon): Promise<{ user: Omit<User, "password">; accessToken: string }> {
        const wallet = await this.walletsService.findOneByAddress(walletAddress);

        if (!wallet || !wallet.nonce) {
            throw new BadRequestException("Wallet not found or nonce not generated");
        }

        try {
            const signatureUint8 = bs58.decode(signature);
            const nonceUint8 = new TextEncoder().encode(wallet.nonce);
            const publicKeyUint8 = bs58.decode(walletAddress);

            const verified = nacl.sign.detached.verify(nonceUint8, signatureUint8, publicKeyUint8);

            if (!verified) {
                throw new UnauthorizedException("Invalid signature");
            }
        } catch {
            throw new UnauthorizedException("Signature verification failed");
        }

        // Clear nonce
        await this.walletsService.updateNonce(wallet.id, null);

        let user: User | null = null;

        if (wallet.userId) {
            user = await this.userRepository.findById(wallet.userId);
        }

        if (!user) {
            // Check if user with this generated email already exists
            const generatedEmail = `solana_${walletAddress.toLowerCase()}@solsight.com`;
            user = await this.userRepository.findByEmail(generatedEmail);

            if (!user) {
                // Auto-create new user
                const dummyPassword = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
                const username = `sol_${walletAddress.slice(0, 6)}_${walletAddress.slice(-4)}`;

                user = await this.userRepository.create({
                    email: generatedEmail,
                    username,
                    password: dummyPassword,
                    isActive: true,
                    isEmailVerified: true
                });
            }

            // Link the wallet to the user
            await this.walletsService.updateUser(wallet.id, user.id, walletIcon || WalletIcon.PHANTOM);
        }

        void this.userRepository.update(user.id, { lastLoginAt: new Date() });
        const accessToken = await this.generateAccessToken(user);
        const { password, ...userWithoutPassword } = user;

        return { user: userWithoutPassword, accessToken };
    }
}
