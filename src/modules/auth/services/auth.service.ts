import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface LoginDto {
  email: string;
  password: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
}

export interface MockUser {
  id: string;
  email: string;
  username: string;
  password: string;
  isActive: boolean;
}

// Mock data
const MOCK_USERS: MockUser[] = [
  { id: '1', email: 'user@example.com', username: 'UserOne', password: '123456', isActive: true },
  { id: '2', email: 'admin@gmail.com', username: 'Admin', password: 'admin123', isActive: true },
];

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) { }

  async login(loginDto: LoginDto) {
    const user = MOCK_USERS.find(
      (u) => u.email === loginDto.email && u.password === loginDto.password && u.isActive,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.generateAccessToken(user);
    return { user: { ...user, password: undefined }, accessToken };
  }

  async generateAccessToken(user: MockUser): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email, username: user.username };
    return this.jwtService.signAsync(payload);
  }

  async validateUserByToken(payload: JwtPayload) {
    const user = MOCK_USERS.find((u) => u.id === payload.sub);
    if (!user) throw new UnauthorizedException('Invalid token');
    return { ...user, password: undefined };
  }
}
