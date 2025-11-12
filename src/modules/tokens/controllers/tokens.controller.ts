import {
  Controller,
  Get,
  Param,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { TokensService } from '../services/tokens.service';

@Controller('tokens')
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Get('search')
  search(@Query('q') q: string, @Query('limit') limit: number = 10) {
    return this.tokensService.search(q, limit);
  }

  @Get(':address')
  findOne(@Param('address') address: string) {
    const data = this.tokensService.findOne(address);
    if (data) return data;
    else throw new NotFoundException('Token not found');
  }
}
