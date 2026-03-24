import { Injectable, Logger } from '@nestjs/common';

export interface TokenContext {
  name: string;
  symbol: string;
  description?: string;
  category?: string;
  website?: string;
}

@Injectable()
export class PromptBuilderService {
  private readonly logger = new Logger(PromptBuilderService.name);

  /**
   * Build a concise prompt for AI token summarization (Jupiter-style)
   * @param token - Token context with basic data
   * @returns Structured prompt for AI
   */
  buildSummaryPrompt(token: TokenContext): string {
    const sections: string[] = [];

    sections.push(
      `Write a concise 2-3 sentence overview of this Solana token in English.`,
    );
    sections.push(`\nToken: ${token.name} (${token.symbol})`);

    if (token.description) {
      sections.push(`Description: ${token.description}`);
    }

    if (token.category) {
      sections.push(`Category: ${token.category}`);
    }

    if (token.website) {
      sections.push(`Website: ${token.website}`);
    }

    sections.push(`\n---`);
    sections.push(`\nWrite a brief summary similar to these examples:`);
    sections.push(
      `"USD Coin (USDC) is a fully backed regulated stablecoin pegged 1:1 to the US dollar, enabling instant low-cost global payments and liquidity across blockchains. Circle, its issuer, went public on the NYSE in June 2025, solidifying USDC's position as a compliant digital asset."`,
    );
    sections.push(
      `\n"Solana is a high-performance layer-1 blockchain designed for scalable decentralized applications and payments, with SOL as its native token for transaction fees and staking. Jump Crypto deployed the Firedancer validator client live on mainnet in December 2025, where it produced 50,000 blocks across select validators."`,
    );
    sections.push(`\nFocus on:`);
    sections.push(`1. What the token/project is and its purpose`);
    sections.push(`2. Key features or recent developments`);
    sections.push(
      `\nDO NOT include specific numbers like price, market cap, volume, or holder counts.`,
    );
    sections.push(`Keep it narrative, informative, and 2-3 sentences only.`);
    sections.push(`Write in English, professional tone.`);

    const prompt = sections.join('\n');
    this.logger.debug(`Built prompt with ${prompt.length} characters`);

    return prompt;
  }
}
