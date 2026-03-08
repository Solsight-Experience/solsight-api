import { WalletsService } from '../../wallets/services/wallets.service';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';
import * as crypto from 'crypto';

// src/auth/services/auth.service.ts
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/user.repository';
import { randomBytes } from 'crypto';
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
  provider: 'google';
  token: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly walletsService: WalletsService,
  ) {}

  // --- Email/Password login ---
  async login(loginDto: LoginDto) {
    const user = await this.userRepository.findActiveByEmailWithPassword(
      loginDto.email,
    );

    if (!user) throw new BadRequestException('Email not found or inactive');
    if (!user.password) {
      throw new BadRequestException(
        'Invalid account configuration. Please contact support.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid)
      throw new BadRequestException('Password is incorrect');

    const accessToken = await this.generateAccessToken(user);
    const { password, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, accessToken };
  }

  async handleOauthLogin(dto: OauthLoginDto) {
    const { provider, token } = dto;

    if (provider !== 'google') {
      throw new BadRequestException('Unsupported provider');
    }

    try {
      // Verify Google token
      const googleRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${token}`,
      );

      if (!googleRes.ok) {
        const errorText = await googleRes.text();
        console.error('Google API error:', errorText);
        throw new BadRequestException('Invalid Google token');
      }

      const profile = await googleRes.json();
      console.log('Google profile:', profile);

      if (!profile.email) {
        throw new BadRequestException('Invalid Google token - no email');
      }

      // Check if user exists
      let user = await this.userRepository.findByEmail(profile.email);

      if (!user) {
        console.log('Creating new OAuth user...');
        const dummyPassword = await bcrypt.hash(
          randomBytes(32).toString('hex'),
          10,
        );
        const username = profile.name
          ? profile.name.replace(/\s+/g, '_').toLowerCase()
          : profile.email.split('@')[0];

        try {
          user = await this.userRepository.create({
            email: profile.email,
            username: username,
            password: dummyPassword,
            firstName: profile.given_name,
            lastName: profile.family_name,
            avatar: profile.picture,
            oauthProvider: 'google',
            oauthId: profile.sub,
            isActive: true,
            isEmailVerified: true,
            // KHÔNG set password - để undefined
          });

          console.log('✅ OAuth user created:', user.id);
        } catch (dbError) {
          console.error('❌ Database error:', dbError);
          console.error('Error code:', dbError.code);
          console.error('Error detail:', dbError.detail);
          throw new BadRequestException(
            `Failed to create user: ${dbError.message}`,
          );
        }
      } else {
        console.log('✅ Existing user found:', user.id);
      }

      const accessToken = await this.generateAccessToken(user);
      const { password, ...userWithoutPassword } = user;

      return { user: userWithoutPassword, accessToken };
    } catch (error) {
      console.error('💥 OAuth login error:', error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(`OAuth login failed: ${error.message}`);
    }
  }

  // --- Register ---
  async register(registerDto: RegisterDto) {
    const emailExists = await this.userRepository.existsByEmail(
      registerDto.email,
    );
    if (emailExists) throw new BadRequestException('Email already exists');

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const newUser = await this.userRepository.create({
      email: registerDto.email,
      username: registerDto.username || registerDto.email.split('@')[0],
      password: hashedPassword,
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      isActive: true,
      isEmailVerified: false,
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
      username: user.username,
    };
    return this.jwtService.signAsync(payload);
  }

  async validateUserByToken(payload: JwtPayload) {
    const user = await this.userRepository.findById(payload.sub);
    if (!user || !user.isActive)
      throw new UnauthorizedException('Invalid token');
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
    walletIcon?: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    const wallet = await this.walletsService.findByAddress(walletAddress);

    if (!wallet || !wallet.nonce) {
      throw new BadRequestException('Wallet not found or nonce not generated');
    }

    try {
      const signatureUint8 = bs58.decode(signature);
      const nonceUint8 = new TextEncoder().encode(wallet.nonce);
      const publicKeyUint8 = bs58.decode(walletAddress);

      const verified = nacl.sign.detached.verify(
        nonceUint8,
        signatureUint8,
        publicKeyUint8,
      );

      if (!verified) {
        throw new UnauthorizedException('Invalid signature');
      }
    } catch (error) {
      throw new UnauthorizedException('Signature verification failed');
    }

    // Clear nonce
    await this.walletsService.updateNonce(wallet.id, null);

    let user;
    if (userId) {
      // Scenario A: Linking
      user = await this.userRepository.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }
    } else {
      // Scenario B: Login
      if (wallet.user) {
        user = wallet.user;
      } else {
        throw new NotFoundException('User not found');
      }
    }

    // if (!wallet.userId || wallet.userId !== user.id) {
    await this.walletsService.updateUser(wallet.id, user.id, walletIcon);
    // }

    return {
      success: true,
      message: 'Wallet verified and linked successfully',
    };
  }
}
