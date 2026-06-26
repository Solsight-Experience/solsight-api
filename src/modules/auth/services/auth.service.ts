import { WalletsService } from "../../wallets/services/wallets.service";
import * as crypto from "crypto";

// src/auth/services/auth.service.ts
import {
    BadRequestException,
    Injectable,
    Logger,
    UnauthorizedException,
    NotFoundException,
    ConflictException,
    ServiceUnavailableException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UserRepository } from "../repositories/user.repository";
import { randomBytes } from "crypto";
import { User } from "../../users/entities/user.entity";
import { WalletIcon } from "../../wallets/enums/wallet-icon.enum";
import { ForgotPasswordDto, ResetPasswordDto, VerifyResetOtpDto } from "../dtos/password-reset.dto";
import { DatabaseError, GoogleTokenProfile, JwtPayload, LoginDto, OauthLoginDto, RegisterDto } from "../types/auth.types";
import { EmailSenderService } from "../../email/services/sender-service";
import { Templates } from "../../email/services/sender-service/template-store";
import { ConfigService } from "@nestjs/config";
import { verifySolanaSignature } from "../utils/solana-signature.util";
import { RedisService } from "../../../redis/services/redis.service";

import { PendingRegistration } from "../types/pending-registration.types";

const PENDING_REGISTRATION_TTL = RedisService.TTL.PENDING_REGISTRATION_TOKEN;

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly userRepository: UserRepository,
        private readonly jwtService: JwtService,
        private readonly walletsService: WalletsService,
        private readonly emailSenderService: EmailSenderService,
        private readonly configService: ConfigService,
        private readonly redisService: RedisService
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
                        // KHÃƒâ€NG set password - Ã„â€˜Ã¡Â»Æ’ undefined
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

        await this.savePendingRegistration({
            email: registerDto.email,
            username: registerDto.username || registerDto.email.split("@")[0],
            password: hashedPassword,
            firstName: registerDto.firstName,
            lastName: registerDto.lastName,
            token: verificationToken
        });

        const clientBaseUrl = this.configService.get<string>("email.verifyBaseUrl");
        const verificationUrl = `${clientBaseUrl}/verify-email?token=${verificationToken}`;
        await this.sendVerificationEmail(registerDto.email, verificationUrl);

        return { message: "Registration successful. Please check your email to verify your account." };
    }

    async verifyEmail(token: string) {
        const pending = await this.findPendingRegistrationByToken(token);
        if (pending) {
            if (await this.userRepository.existsByEmail(pending.email)) {
                await this.deletePendingRegistration(pending);
                throw new ConflictException("Email already exists");
            }

            await this.userRepository.create({
                email: pending.email,
                username: pending.username,
                password: pending.password,
                firstName: pending.firstName,
                lastName: pending.lastName,
                isActive: true,
                isEmailVerified: true
            });

            await this.deletePendingRegistration(pending);
            return { message: "Email verified successfully. You can now log in." };
        }

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

    async forgotPassword(dto: ForgotPasswordDto) {
        const user = await this.userRepository.findByEmail(dto.email);

        if (user?.isActive) {
            const otp = String(crypto.randomInt(100000, 1000000));
            const hashedOtp = await bcrypt.hash(otp, 10);
            const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

            await this.userRepository.update(user.id, {
                passwordResetToken: hashedOtp,
                passwordResetExpires: otpExpires
            });

            if (this.emailSenderService.hasKey) {
                try {
                    await this.emailSenderService.sendWithTemplate(
                        { to: dto.email, subject: "Your SolSight password reset code" },
                        Templates.PASSWORD_RESET_OTP([otp])
                    );
                } catch (err) {
                    this.logger.error(`Failed to send password reset email to ${dto.email}`, err);
                }
            } else {
                this.logger.warn("RESEND_API_KEY not set Ã¢â‚¬â€ skipping password reset email");
            }
        }

        return { message: "If an account exists, a reset code has been sent to your email." };
    }

    async verifyResetOtp(dto: VerifyResetOtpDto) {
        await this.validatePasswordResetOtp(dto.email, dto.otp);
        return { message: "OTP verified successfully." };
    }

    async resetPassword(dto: ResetPasswordDto) {
        const user = await this.validatePasswordResetOtp(dto.email, dto.otp);
        const hashedPassword = await bcrypt.hash(dto.password, 10);

        await this.userRepository.update(user.id, {
            password: hashedPassword,
            passwordResetToken: null,
            passwordResetExpires: null
        });

        return { message: "Password reset successfully. You can now log in." };
    }

    private async validatePasswordResetOtp(email: string, otp: string): Promise<User> {
        const user = await this.userRepository.findByEmail(email);

        if (!user?.passwordResetToken || !user.passwordResetExpires) {
            throw new BadRequestException("Invalid OTP");
        }

        if (user.passwordResetExpires < new Date()) {
            throw new BadRequestException("OTP has expired");
        }

        const isValid = await bcrypt.compare(otp, user.passwordResetToken);
        if (!isValid) {
            throw new BadRequestException("Invalid OTP");
        }

        return user;
    }

    async resendVerificationEmail(email: string) {
        const pending = await this.findPendingRegistrationByEmail(email);
        if (pending) {
            const verificationToken = randomBytes(32).toString("hex");
            await this.savePendingRegistration({ ...pending, token: verificationToken });

            const clientBaseUrl = this.configService.get<string>("email.verifyBaseUrl");
            const verificationUrl = `${clientBaseUrl}/verify-email?token=${verificationToken}`;
            await this.sendVerificationEmail(email, verificationUrl);

            return { message: "Verification email sent. Please check your inbox." };
        }

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
        await this.sendVerificationEmail(email, verificationUrl);

        return { message: "Verification email sent. Please check your inbox." };
    }

    private async savePendingRegistration(data: PendingRegistration): Promise<void> {
        this.ensureRedisAvailable();

        const existingToken = await this.redisService.get<string>(RedisService.KEYS.PENDING_REGISTRATION_EMAIL(data.email));
        if (existingToken && existingToken !== data.token) {
            await this.redisService.del(RedisService.KEYS.PENDING_REGISTRATION_TOKEN(existingToken));
        }

        await this.redisService.set(RedisService.KEYS.PENDING_REGISTRATION_TOKEN(data.token), data, PENDING_REGISTRATION_TTL);
        await this.redisService.set(RedisService.KEYS.PENDING_REGISTRATION_EMAIL(data.email), data.token, PENDING_REGISTRATION_TTL);
    }

    private findPendingRegistrationByToken(token: string): Promise<PendingRegistration | null> {
        return this.redisService.get<PendingRegistration>(RedisService.KEYS.PENDING_REGISTRATION_TOKEN(token));
    }

    private async findPendingRegistrationByEmail(email: string): Promise<PendingRegistration | null> {
        const token = await this.redisService.get<string>(RedisService.KEYS.PENDING_REGISTRATION_EMAIL(email));
        if (!token) return null;
        return this.findPendingRegistrationByToken(token);
    }

    private async deletePendingRegistration(data: PendingRegistration): Promise<void> {
        await this.redisService.del(RedisService.KEYS.PENDING_REGISTRATION_TOKEN(data.token));
        await this.redisService.del(RedisService.KEYS.PENDING_REGISTRATION_EMAIL(data.email));
    }

    private ensureRedisAvailable(): void {
        if (!this.redisService.getClient()) {
            throw new ServiceUnavailableException("Registration is temporarily unavailable. Please try again later.");
        }
    }

    private async sendVerificationEmail(email: string, verificationUrl: string): Promise<void> {
        if (this.emailSenderService.hasKey) {
            try {
                await this.emailSenderService.sendWithTemplate(
                    { to: email, subject: "Verify your SolSight account" },
                    Templates.VERIFICATION([verificationUrl])
                );
            } catch (err) {
                this.logger.error(`Failed to send verification email to ${email}`, err);
            }
        } else {
            this.logger.warn("RESEND_API_KEY not set Ã¢â‚¬â€ skipping verification email");
        }
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
        userId?: string,
        message?: string
    ): Promise<{ success: boolean; message: string }> {
        const wallet = await this.walletsService.findByAddress(walletAddress);

        if (!wallet || !wallet.nonce) {
            throw new BadRequestException("Wallet not found or nonce not generated");
        }

        verifySolanaSignature(walletAddress, signature, wallet.nonce, message);

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

    async loginWithSolana(
        walletAddress: string,
        signature: string,
        walletIcon?: WalletIcon,
        message?: string
    ): Promise<{ user: Omit<User, "password">; accessToken: string }> {
        const wallet = await this.walletsService.findOneByAddress(walletAddress);

        if (!wallet || !wallet.nonce) {
            throw new BadRequestException("Wallet not found or nonce not generated");
        }

        verifySolanaSignature(walletAddress, signature, wallet.nonce, message);

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
