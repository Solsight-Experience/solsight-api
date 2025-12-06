// src/auth/services/auth.service.ts
import { BadRequestException, Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/user.repository';

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
  ) { }

  // src/auth/services/auth.service.ts
  async login(loginDto: LoginDto) {
    const user = await this.userRepository.findActiveByEmailWithPassword(loginDto.email);

    if (!user) {
      throw new BadRequestException('Email not found or inactive');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

    if (!isPasswordValid) {
      throw new BadRequestException('Password is incorrect');
    }

    const accessToken = await this.generateAccessToken(user);

    const { password, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, accessToken };
  }

  async register(registerDto: RegisterDto) {
    try {
      const emailExists = await this.userRepository.existsByEmail(registerDto.email);
      if (emailExists) {
        throw new BadRequestException('Email already exists');
      }

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
    } catch (error) {
      console.error('Error creating user:', error);
      throw new BadRequestException('Error creating user: ' + error.message);
    }
  }

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

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid token');
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}