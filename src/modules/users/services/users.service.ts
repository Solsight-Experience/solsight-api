// import {
//   Injectable,
//   ConflictException,
//   NotFoundException,
//   BadRequestException,
// } from '@nestjs/common';
// import { UsersRepository } from '../repositories/users.repository';
// import { CreateUserDto } from '../dtos/create-user.dto';
// import { User } from '../entities/user.entity';
// import * as bcrypt from 'bcrypt';
// import * as crypto from 'crypto';

// @Injectable()
// export class UsersService {
//   constructor(private readonly usersRepository: UsersRepository) {}

//   async create(createUserDto: CreateUserDto): Promise<User> {
//     // Check if user already exists
//     const existingEmail = await this.usersRepository.findByEmail(
//       createUserDto.email,
//     );
//     if (existingEmail) {
//       throw new ConflictException('Email already exists');
//     }

//     const existingUsername = await this.usersRepository.findByUsername(
//       createUserDto.username,
//     );
//     if (existingUsername) {
//       throw new ConflictException('Username already exists');
//     }

//     // Hash password
//     const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

//     // Generate email verification token
//     const emailVerificationToken = crypto.randomBytes(32).toString('hex');

//     const user = await this.usersRepository.create({
//       ...createUserDto,
//       password: hashedPassword,
//       emailVerificationToken,
//     });

//     // Remove password from response
//     const { password, ...userWithoutPassword } = user;
//     return userWithoutPassword;
//   }

//   async findById(id: string): Promise<User> {
//     const user = await this.usersRepository.findById(id);
//     if (!user) {
//       throw new NotFoundException('User not found');
//     }
//     return user;
//   }

//   async findByEmail(email: string): Promise<User> {
//     const user = await this.usersRepository.findByEmail(email);
//     if (!user) {
//       throw new NotFoundException('User not found');
//     }
//     return user;
//   }

//   async findAll(
//     page = 1,
//     limit = 10,
//   ): Promise<{ users: User[]; total: number; page: number; limit: number }> {
//     const [users, total] = await this.usersRepository.findAll(page, limit);
//     return {
//       users,
//       total,
//       page,
//       limit,
//     };
//   }

//   async update(id: string, updateData: Partial<User>): Promise<User> {
//     const user = await this.findById(id);

//     if (updateData.email && updateData.email !== user.email) {
//       const existingEmail = await this.usersRepository.findByEmail(
//         updateData.email,
//       );
//       if (existingEmail) {
//         throw new ConflictException('Email already exists');
//       }
//     }

//     if (updateData.username && updateData.username !== user.username) {
//       const existingUsername = await this.usersRepository.findByUsername(
//         updateData.username,
//       );
//       if (existingUsername) {
//         throw new ConflictException('Username already exists');
//       }
//     }

//     if (updateData.password) {
//       updateData.password = await bcrypt.hash(updateData.password, 10);
//     }

//     return await this.usersRepository.update(id, updateData);
//   }

//   async delete(id: string): Promise<void> {
//     await this.findById(id); // Check if user exists
//     await this.usersRepository.delete(id);
//   }

//   async verifyEmail(token: string): Promise<User> {
//     const user = await this.usersRepository.findByEmailVerificationToken(token);
//     if (!user) {
//       throw new BadRequestException('Invalid verification token');
//     }

//     return await this.usersRepository.update(user.id, {
//       isEmailVerified: true,
//       emailVerificationToken: null,
//     });
//   }

//   async generatePasswordResetToken(email: string): Promise<string> {
//     const user = await this.findByEmail(email);
//     const resetToken = crypto.randomBytes(32).toString('hex');
//     const resetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

//     await this.usersRepository.update(user.id, {
//       passwordResetToken: resetToken,
//       passwordResetExpires: resetExpires,
//     });

//     return resetToken;
//   }

//   async resetPassword(token: string, newPassword: string): Promise<User> {
//     const user = await this.usersRepository.findByPasswordResetToken(token);
//     if (
//       !user ||
//       !user.passwordResetExpires ||
//       user.passwordResetExpires < new Date()
//     ) {
//       throw new BadRequestException('Invalid or expired reset token');
//     }

//     const hashedPassword = await bcrypt.hash(newPassword, 10);

//     return await this.usersRepository.update(user.id, {
//       password: hashedPassword,
//       passwordResetToken: null,
//       passwordResetExpires: null,
//     });
//   }

//   async validatePassword(
//     password: string,
//     hashedPassword: string,
//   ): Promise<boolean> {
//     return await bcrypt.compare(password, hashedPassword);
//   }
// }
