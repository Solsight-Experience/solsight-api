import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { WalletAlertService } from './wallet-alert.service';
import { WalletAlert, WalletAlertType, WalletAlertCondition } from './entities/wallet-alert.entity';
import { NotificationsService } from '../notifications/services/notifications.service';
import { NotificationEventType } from '../notifications/entities/notification.entity';
import { SolanaService } from '../../infra/solana/solana.service';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface TokenMeta { symbol: string; name: string; logoURI?: string }

@Injectable()
export class WalletAlertCheckerService {
  private readonly logger = new Logger(WalletAlertCheckerService.name);
  /** In-memory token metadata cache: mint → { symbol, name, logoURI } */
  private readonly tokenCache = new Map<string, TokenMeta>([
    [SOL_MINT, { symbol: 'SOL', name: 'Solana', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' }],
  ]);

  constructor(
    private readonly walletAlertService: WalletAlertService,
    private readonly notificationsService: NotificationsService,
    private readonly solanaService: SolanaService,
  ) {}

  /** Resolve a mint address to token metadata. Tries Jupiter first, then Helius DAS. */
  private async resolveToken(mint: string): Promise<TokenMeta> {
    if (this.tokenCache.has(mint)) return this.tokenCache.get(mint)!;

    // 1. Jupiter token list (covers verified/tradeable tokens)
    try {
      const { data } = await axios.get(`https://tokens.jup.ag/token/${mint}`, { timeout: 3000 });
      if (data?.symbol) {
        const meta: TokenMeta = { symbol: data.symbol, name: data.name ?? data.symbol, logoURI: data.logoURI };
        this.tokenCache.set(mint, meta);
        return meta;
      }
    } catch { /* fall through */ }

    // 2. Helius DAS getAsset (covers any on-chain token, including meme coins)
    try {
      const heliusApiKey = this.solanaService.getHeliusApiKey();
      const baseUrl = this.solanaService.getHeliusBaseUrl();
      if (heliusApiKey) {
        const { data } = await axios.post(
          `${baseUrl}/?api-key=${heliusApiKey}`,
          { jsonrpc: '2.0', id: 'resolve', method: 'getAsset', params: { id: mint } },
          { timeout: 4000 },
        );
        const result = data?.result;
        // Fungible SPL tokens store symbol under token_info; NFTs use content.metadata
        const symbol: string | undefined =
          result?.token_info?.symbol ||
          result?.content?.metadata?.symbol;
        const name: string | undefined =
          result?.content?.metadata?.name ||
          result?.token_info?.symbol;
        const logoURI: string | undefined =
          result?.content?.links?.image ||
          result?.content?.files?.[0]?.uri;
        if (symbol) {
          const meta: TokenMeta = { symbol, name: name ?? symbol, logoURI };
          this.tokenCache.set(mint, meta);
          return meta;
        }
      }
    } catch { /* fall through */ }

    // 3. DexScreener (covers pump.fun and brand-new meme coins missed by Jupiter/Helius)
    try {
      const { data } = await axios.get(
        `https://api.dexscreener.com/tokens/v1/solana/${mint}`,
        { timeout: 4000 },
      );
      const pair = Array.isArray(data) ? data[0] : data?.pairs?.[0];
      const baseToken = pair?.baseToken;
      if (baseToken?.symbol && baseToken.address?.toLowerCase() === mint.toLowerCase()) {
        const meta: TokenMeta = { symbol: baseToken.symbol, name: baseToken.name ?? baseToken.symbol, logoURI: pair?.info?.imageUrl };
        this.tokenCache.set(mint, meta);
        return meta;
      }
    } catch { /* fall through */ }

    const meta: TokenMeta = { symbol: mint.slice(0, 6), name: mint.slice(0, 10) };
    this.tokenCache.set(mint, meta);
    return meta;
  }

  @Cron('*/10 * * * * *')
  async checkAllAlerts(): Promise<void> {
    const heliusApiKey = this.solanaService.getHeliusApiKey();
    if (!heliusApiKey) {
      this.logger.warn('Helius API key not configured — skipping alert check');
      return;
    }

    const alerts = await this.walletAlertService.getAllActiveAlerts();
    this.logger.log(`Checking ${alerts.length} active alert(s)`);
    if (!alerts.length) return;

    // Group alerts by wallet address to batch Helius calls
    const alertsByWallet = new Map<string, WalletAlert[]>();
    for (const alert of alerts) {
      const list = alertsByWallet.get(alert.walletAddress) ?? [];
      list.push(alert);
      alertsByWallet.set(alert.walletAddress, list);
    }

    for (const [walletAddress, walletAlerts] of alertsByWallet) {
      try {
        await this.processWallet(walletAddress, walletAlerts, heliusApiKey);
      } catch (err) {
        this.logger.error(`Failed to process alerts for ${walletAddress}`, err);
      }
    }
  }

  private async processWallet(
    walletAddress: string,
    alerts: WalletAlert[],
    heliusApiKey: string,
  ): Promise<void> {
    const txs = await this.fetchRecentTxs(walletAddress, heliusApiKey);
    if (!txs.length) return;

    const latestSig: string = txs[0].signature;

    for (const alert of alerts) {
      // First-time initialization: set the cursor without triggering notifications
      if (!alert.lastCheckedSignature) {
        await this.walletAlertService.updateLastChecked(alert.id, latestSig);
        continue;
      }

      const newTxs = this.getNewTransactions(txs, alert.lastCheckedSignature);
      this.logger.log(`Alert ${alert.id} (${alert.alertType}): ${newTxs.length} new tx(s)`);
      if (!newTxs.length) continue;

      for (const tx of newTxs) {
        this.logger.debug(`Alert ${alert.id} evaluating tx ${tx.signature} type=${tx.type} hasSwapEvent=${!!tx.events?.swap} source=${tx.source}`);
        if (this.evaluateAlert(alert, tx, walletAddress)) {
          this.logger.log(`Alert ${alert.id} triggered by tx ${tx.signature} (type: ${tx.type})`);
          await this.sendNotification(alert, tx).catch((err) =>
            this.logger.error(`Failed to send notification for alert ${alert.id}`, err),
          );
        }
      }

      await this.walletAlertService.updateLastChecked(alert.id, latestSig);
    }
  }

  /** Returns txs newer than lastCheckedSig (Helius returns newest-first) */
  private getNewTransactions(txs: any[], lastCheckedSig: string): any[] {
    const idx = txs.findIndex((tx) => tx.signature === lastCheckedSig);
    return idx === -1 ? txs : txs.slice(0, idx);
  }

  private async fetchRecentTxs(walletAddress: string, heliusApiKey: string): Promise<any[]> {
    try {
      const baseUrl = this.solanaService.getHeliusBaseUrl();
      const { data } = await axios.get(
        `${baseUrl}/v0/addresses/${walletAddress}/transactions`,
        { params: { 'api-key': heliusApiKey, limit: 50 } },
      );
      return data ?? [];
    } catch (err) {
      this.logger.warn(`Helius fetch failed for ${walletAddress}: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  private evaluateAlert(alert: WalletAlert, tx: any, walletAddress: string): boolean {
    switch (alert.alertType) {
      case WalletAlertType.ANY_SWAP: {
        const DEX_SOURCES = [
          'JUPITER', 'RAYDIUM', 'ORCA', 'METEORA', 'PHOENIX', 'OPENBOOK', 'SOLFI',
          'PUMP_FUN', 'PUMP_AMM', 'MOONSHOT', 'FLUXBEAM', 'ALDRIN', 'LIFINITY', 'INVARIANT',
        ];
        if (tx.type === 'SWAP' || !!tx.events?.swap || DEX_SOURCES.includes(tx.source)) return true;
        // Structural detection: SOL spent + token received (buy), or token sent + token received (swap)
        const nativeSolOut = (tx.nativeTransfers ?? []).some((t: any) => t.fromUserAccount === walletAddress && t.amount > 0);
        const tokenIn  = (tx.tokenTransfers ?? []).some((t: any) => t.toUserAccount   === walletAddress);
        const tokenOut = (tx.tokenTransfers ?? []).some((t: any) => t.fromUserAccount === walletAddress);
        if ((nativeSolOut && tokenIn) || (tokenOut && tokenIn)) return true;
        // Last resort: Jupiter multi-hop routes split into separate txs (each looks like TRANSFER).
        // Treat any tx where the wallet received a token as a swap trigger, since ANY_SWAP
        // alerts care about token movements regardless of Helius classification.
        return tokenIn;
      }

      case WalletAlertType.TOKEN_BALANCE_CHANGE:
        return this.checkTokenChange(alert.condition, tx, walletAddress);

      case WalletAlertType.LARGE_TRANSFER:
        return this.checkLargeTransfer(alert.condition, tx);

      default:
        return false;
    }
  }

  private checkTokenChange(
    condition: WalletAlertCondition | undefined,
    tx: any,
    walletAddress: string,
  ): boolean {
    if (!condition?.tokenMint) return false;

    const transfers: any[] = tx.tokenTransfers ?? [];
    const relevant = transfers.filter((t) => t.mint === condition.tokenMint);
    if (!relevant.length) return false;

    let netChange = 0;
    for (const t of relevant) {
      const amount: number = t.tokenAmount ?? 0;
      if (t.toUserAccount === walletAddress) netChange += amount;
      else if (t.fromUserAccount === walletAddress) netChange -= amount;
    }

    const threshold = condition.threshold ?? 0;
    if (Math.abs(netChange) < threshold) return false;

    const dir = condition.direction ?? 'any';
    if (dir === 'increase' && netChange <= 0) return false;
    if (dir === 'decrease' && netChange >= 0) return false;

    return true;
  }

  private checkLargeTransfer(condition: WalletAlertCondition | undefined, tx: any): boolean {
    if (tx.type !== 'TRANSFER') return false;
    const minSol = condition?.minAmountSol ?? 1;
    const nativeTransfers: any[] = tx.nativeTransfers ?? [];
    const totalSol = nativeTransfers.reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0) / 1e9;
    return totalSol >= minSol;
  }

  /** Extract swap token mints + amounts from a Helius transaction */
  private extractSwapMints(tx: any, walletAddress: string): {
    mintIn?: string; mintOut?: string;
    amountIn?: number; amountOut?: number;
    dex?: string;
  } {
    const dex = tx.source && tx.source !== 'UNKNOWN' ? tx.source : undefined;
    const swap = tx.events?.swap;
    let mintIn: string | undefined, mintOut: string | undefined;
    let amountIn: number | undefined, amountOut: number | undefined;

    if (swap) {
      if (swap.nativeInput)       { mintIn  = SOL_MINT; amountIn  = swap.nativeInput.amount / 1e9; }
      else if (swap.tokenInputs?.[0])  { const i = swap.tokenInputs[0];  mintIn  = i.mint; amountIn  = parseFloat(i.rawTokenAmount?.tokenAmount ?? '0'); }
      if (swap.nativeOutput)      { mintOut = SOL_MINT; amountOut = swap.nativeOutput.amount / 1e9; }
      else if (swap.tokenOutputs?.[0]) { const o = swap.tokenOutputs[0]; mintOut = o.mint; amountOut = parseFloat(o.rawTokenAmount?.tokenAmount ?? '0'); }
    } else {
      const sold   = (tx.tokenTransfers ?? []).find((t: any) => t.fromUserAccount === walletAddress);
      const bought = (tx.tokenTransfers ?? []).find((t: any) => t.toUserAccount   === walletAddress);
      if (sold)   { mintIn  = sold.mint;   amountIn  = sold.tokenAmount; }
      if (bought) { mintOut = bought.mint; amountOut = bought.tokenAmount; }
      // SOL → token: no token sold, but SOL was spent natively (buy)
      if (!mintIn) {
        const solSpent = (tx.nativeTransfers ?? [])
          .filter((t: any) => t.fromUserAccount === walletAddress)
          .reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0);
        if (solSpent > 0) { mintIn = SOL_MINT; amountIn = solSpent / 1e9; }
      }
      // token → SOL: no token received, but SOL was received natively (sell)
      if (!mintOut) {
        const solReceived = (tx.nativeTransfers ?? [])
          .filter((t: any) => t.toUserAccount === walletAddress)
          .reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0);
        if (solReceived > 0) { mintOut = SOL_MINT; amountOut = solReceived / 1e9; }
      }
    }
    return { mintIn, mintOut, amountIn, amountOut, dex };
  }

  private fmt(n: number | undefined): string {
    if (n == null) return '';
    if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(4).replace(/\.?0+$/, '');
    const decimals = Math.max(2, -Math.floor(Math.log10(n)) + 1);
    return n.toFixed(decimals);
  }

  private async sendNotification(alert: WalletAlert, tx: any): Promise<void> {
    const short = `${alert.walletAddress.slice(0, 6)}...${alert.walletAddress.slice(-4)}`;
    const walletLabel: string = (alert as any).watchedWallet?.label ?? short;
    const txUrl = `https://solscan.io/tx/${tx.signature}`;
    const walletTrackerUrl = `/wallet-tracker`;
    let type: NotificationEventType;
    let title: string;
    let message: string;
    let extraMeta: Record<string, any> = {};

    switch (alert.alertType) {
      case WalletAlertType.ANY_SWAP: {
        const { mintIn, mintOut, amountIn, amountOut, dex } =
          this.extractSwapMints(tx, alert.walletAddress);

        const [metaIn, metaOut] = await Promise.all([
          mintIn ? this.resolveToken(mintIn) : Promise.resolve(undefined),
          mintOut ? this.resolveToken(mintOut) : Promise.resolve(undefined),
        ]);

        const symbolIn = metaIn?.symbol;
        const symbolOut = metaOut?.symbol;
        const nameIn = metaIn?.name;
        const nameOut = metaOut?.name;
        const logoIn = metaIn?.logoURI;
        const logoOut = metaOut?.logoURI;

        type = NotificationEventType.SWAP_EXECUTED;

        const pair = symbolIn && symbolOut ? `${symbolIn} → ${symbolOut}` : 'Swap';
        title = pair;
        message = [
          symbolIn && amountIn != null ? `${this.fmt(amountIn)} ${symbolIn}` : null,
          symbolIn && symbolOut ? '→' : null,
          symbolOut && amountOut != null ? `${this.fmt(amountOut)} ${symbolOut}` : null,
          dex ? `via ${dex}` : null,
          `· ${walletLabel}`,
        ].filter(Boolean).join(' ');

        extraMeta = {
          tokenIn: symbolIn, tokenOut: symbolOut,
          tokenInName: nameIn, tokenOutName: nameOut,
          tokenInLogo: logoIn, tokenOutLogo: logoOut,
          amountIn, amountOut,
          mintIn, mintOut,
          dex,
          walletLabel,
          walletTrackerUrl,
        };
        break;
      }
      case WalletAlertType.TOKEN_BALANCE_CHANGE: {
        const sym = alert.condition?.tokenSymbol ?? 'Token';
        type = NotificationEventType.PRICE_ALERT_TRIGGERED;
        title = `${sym} balance changed`;
        message = `${sym} balance changed · ${walletLabel}`;
        extraMeta = { tokenSymbol: sym, tokenMint: alert.condition?.tokenMint, walletLabel, walletTrackerUrl };
        break;
      }
      case WalletAlertType.LARGE_TRANSFER: {
        const nativeTransfers: any[] = tx.nativeTransfers ?? [];
        const totalSol = nativeTransfers.reduce((s: number, t: any) => s + (t.amount ?? 0), 0) / 1e9;
        const from: string | undefined = nativeTransfers[0]?.fromUserAccount;
        const to: string | undefined = nativeTransfers[0]?.toUserAccount;
        const direction = to === alert.walletAddress ? 'Received' : 'Sent';
        type = NotificationEventType.TRANSACTION_CONFIRMED;
        title = `${direction} ${this.fmt(totalSol)} SOL`;
        message = `${direction} ${this.fmt(totalSol)} SOL · ${walletLabel}`;
        extraMeta = { amountSol: totalSol, direction, from, to, walletLabel, walletTrackerUrl };
        break;
      }
      default:
        return;
    }

    await this.notificationsService.notifyUser(alert.userId, {
      type,
      title,
      message,
      metadata: {
        walletAddress: alert.walletAddress,
        walletShort: short,
        txSignature: tx.signature,
        txUrl,
        alertId: alert.id,
        alertType: alert.alertType,
        ...extraMeta,
      },
    });
  }
}
