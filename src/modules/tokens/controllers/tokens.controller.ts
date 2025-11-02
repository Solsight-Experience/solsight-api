import { Controller, Get } from '@nestjs/common';
import { TokensService } from '../services/tokens.service';

@Controller('tokens')
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Get()
  findAll() {
    return this.tokensService.findAll();
  }
}
