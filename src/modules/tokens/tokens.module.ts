import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Token } from './entities/token.entity';
import { TokensService } from './services/tokens.service';
import { TokensController } from './controllers/tokens.controller';
import { TokenSeederService } from './services/token-seeder.service';
import { SolanaModule } from 'src/infra/solana/solana.module';
import { TokensOnchainService } from './services/tokens.onchain.service';

@Module({
  imports: [TypeOrmModule.forFeature([Token]), SolanaModule],
  providers: [TokensService, TokensOnchainService, TokenSeederService],
  controllers: [TokensController],
})
export class TokensModule {}
