import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { CreateUserDto } from '../dtos/create-user.dto';
import { User } from '../entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return await this.usersService.create(createUserDto);
  }

  @Get()
  async findAll(@Query('page') page = 1, @Query('limit') limit = 10) {
    return await this.usersService.findAll(Number(page), Number(limit));
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<User> {
    return await this.usersService.findById(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateData: Partial<User>,
  ): Promise<User> {
    return await this.usersService.update(id, updateData);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.usersService.delete(id);
    return { message: 'User deleted successfully' };
  }

  @Post('verify-email/:token')
  async verifyEmail(@Param('token') token: string): Promise<User> {
    return await this.usersService.verifyEmail(token);
  }

  @Post('forgot-password')
  async forgotPassword(
    @Body('email') email: string,
  ): Promise<{ message: string }> {
    await this.usersService.generatePasswordResetToken(email);
    return { message: 'Password reset token sent to your email' };
  }

  @Post('reset-password/:token')
  async resetPassword(
    @Param('token') token: string,
    @Body('password') password: string,
  ): Promise<{ message: string }> {
    await this.usersService.resetPassword(token, password);
    return { message: 'Password reset successfully' };
  }
}
