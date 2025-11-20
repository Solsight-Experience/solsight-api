import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Token } from '../tokens/entities/token.entity';
import { Category } from '../tokens/entities/category.entity';
import { DiscoveryController } from './controllers/discovery.controller';
import { DiscoveryService } from './services/discovery.service';

@Module({
  imports: [TypeOrmModule.forFeature([Token, Category])],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
