import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from 'src/modules/users/dtos/create-user.dto';
import { User } from 'src/modules/users/entities/user.entity';
import { UsersService } from 'src/modules/users/services/users.service';
import { WalletsService } from '../../wallets/services/wallets.service';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';
import * as crypto from 'crypto';

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  username: string;
  password: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
}


@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly walletsService: WalletsService,
  ) {}

  async register(
    createUserDto: CreateUserDto,
  ): Promise<{ user: User; accessToken: string }> {
    const user = await this.usersService.create(createUserDto);
    const accessToken = await this.generateAccessToken(user);

    return {
      user,
      accessToken,
    };
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ user: User; accessToken: string }> {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    const accessToken = await this.generateAccessToken(user);

    // Remove password from response
    delete user.password;

    return {
      user,
      accessToken,
    };
  }

  async getSolanaNonce(walletAddress: string): Promise<{ nonce: string }> {
    let wallet = await this.walletsService.findOneByAddress(walletAddress);
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

    let user: User;

    if (userId) {
      // Scenario A: Linking
      user = await this.usersService.findById(userId);
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

    return { success: true, message: 'Wallet verified and linked successfully' };
  }

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.usersService.validatePassword(
      password,
      user.password,
    );

    if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async generateAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
    };
    return this.jwtService.signAsync(payload);
  }
  
  async validateUserByToken(payload: JwtPayload): Promise<User | null> {
    const user = await this.usersService.findById(payload.sub
    );
    if (user && user.isActive) {
      return user;
    }
    return null;
  }
}