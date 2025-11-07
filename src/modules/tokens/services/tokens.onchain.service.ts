import { Injectable, NotFoundException } from '@nestjs/common';
import { SolanaService } from 'src/infra/solana/solana.service';
import { getMint } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';

@Injectable()
export class TokensOnchainService {
  private connection: Connection;
  constructor(private readonly solanaService: SolanaService) {
    this.connection = this.solanaService.getConnection();
  }

  async getMint(mintAddress: string) {
    const mintPubkey = new PublicKey(mintAddress);
    const mintInfo = await getMint(this.connection, mintPubkey);

    const uri = 'https://lite-api.jup.ag/tokens/v2/search?query=' + mintAddress;
    const response = await fetch(uri);
    const metadataJson = await response.json();

    return {
      address: mintAddress,
      metadataJson,
    };
  }
}
