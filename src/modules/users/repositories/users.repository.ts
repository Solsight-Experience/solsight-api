import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dtos/create-user.dto';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.userRepository.create(createUserDto);
    return await this.userRepository.save(user);
  }

  async findById(id: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { id },
      relations: ['wallets'],
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'username', 'password', 'isActive', 'isEmailVerified'],
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { username },
    });
  }

  async findByEmailVerificationToken(token: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { emailVerificationToken: token },
    });
  }

  async findByPasswordResetToken(token: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { passwordResetToken: token },
    });
  }

  async update(id: string, updateData: Partial<User>): Promise<User> {
    await this.userRepository.update(id, updateData);
    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    await this.userRepository.delete(id);
  }

  async findAll(page = 1, limit = 10): Promise<[User[], number]> {
    return await this.userRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      relations: ['wallets'],
    });
  }
}
