import { Controller, Get, Param } from '@nestjs/common';
import { TokensService } from '../services/tokens.service';
import { TokensOnchainService } from '../services/tokens.onchain.service';

@Controller('token')
export class TokensController {
  constructor(
    private readonly tokensService: TokensService,
    private readonly TokensOnchainService: TokensOnchainService,
  ) {}

  @Get()
  findAll() {
    return this.tokensService.findAll();
  }

  @Get(':address')
  findOne(@Param('address') address: string) {
    return this.tokensService.findOne(address);
    // return this.TokensOnchainService.getMint(address);
  }
}
