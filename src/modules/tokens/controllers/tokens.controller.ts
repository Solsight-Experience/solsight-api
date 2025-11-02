import { Controller, Get, Param } from '@nestjs/common';
import { TokensService } from '../services/tokens.service';

@Controller('tokens')
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Get()
  findAll() {
    return this.tokensService.findAll();
  }

  @Get(':mintAddress')
  findOne(@Param('mintAddress') mintAddress: string) {
    return this.tokensService.findOne(mintAddress);
  }
}
