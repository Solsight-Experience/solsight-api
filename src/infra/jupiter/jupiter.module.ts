import { Module } from '@nestjs/common';
import { JupiterService } from './jupiter.service';

@Module({
  providers: [JupiterService],
  exports: [JupiterService],
})
export class JupiterModule {}
