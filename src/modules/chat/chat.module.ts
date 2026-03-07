import { Module } from '@nestjs/common';
import { LoggerModule } from 'src/common/logger/logger.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { TokensModule } from '../tokens/tokens.module';
import { ChatService } from './services/chat.service';
import { WebsocketModule } from 'src/websocket/websocket.module';
import { ChatGateway } from './gateways/chat.gateway';

@Module({
  imports: [TokensModule, PortfolioModule, DiscoveryModule, LoggerModule, WebsocketModule],
  providers: [ChatService, ChatGateway],
  controllers: [require('./controllers/chat.controller').ChatController],
  exports: [ChatService],
})
export class ChatModule {}
