import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Token } from './entities/token.entity';
import { TokensService } from './services/tokens.service';
import { TokensController } from './controllers/tokens.controller';
import { TokenSeederService } from './services/token-seeder.service';

@Module({
  imports: [TypeOrmModule.forFeature([Token])],
  providers: [TokensService, TokenSeederService],
  controllers: [TokensController],
})
export class TokensModule {}
