import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Token } from './entities/token.entity';
import { TokensService } from './services/tokens.service';
import { TokensController } from './controllers/tokens.controller';
import { TokenSeederService } from './services/token-seeder.service';
import { SolanaModule } from 'src/infra/solana/solana.module';
import { ConfigModule } from '@nestjs/config';
import { WebsocketModule } from '../../websocket/websocket.module';
import { TokenSocketService } from './services/socket/token.socket.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Token]),
    SolanaModule,
    ConfigModule,
    WebsocketModule,
  ],
  providers: [TokensService, TokenSocketService, TokenSeederService],
  controllers: [TokensController],
})
export class TokensModule {}
