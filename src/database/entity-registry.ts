import { Token } from "../modules/tokens/entities/token.entity";
import { OhlcCandle } from "../modules/tokens/entities/ohlc-candle.entity";
import { Category } from "../modules/tokens/entities/category.entity";
import { Transaction } from "../modules/transactions/entities/transaction.entity";
import { SwapTrade } from "../modules/portfolio/entities/swap-trade.entity";
import { WalletSnapshot } from "../modules/portfolio/entities/wallet-snapshot.entity";
import { MarketPriceEvent } from "../modules/indexer/entities/market-price-event.entity";
import { User } from "../modules/users/entities/user.entity";
import { Wallet } from "../modules/wallets/entities/wallet.entity";
import { EmailSubscription } from "../modules/email/entities/email-subscription.entity";
import { Notification } from "../modules/notifications/entities/notification.entity";
import { ZaloSubscription } from "../modules/zalo/entities/zalo-subscription.entity";
import { WalletAlert } from "../modules/watchlist/entities/wallet-alert.entity";
import { WatchedWallet } from "../modules/watchlist/entities/watched-wallet.entity";
import { FavoriteToken } from "../modules/account/entities/favorite-token.entity";

export type AppEntity =
    | Token
    | OhlcCandle
    | Category
    | Transaction
    | SwapTrade
    | WalletSnapshot
    | MarketPriceEvent
    | User
    | Wallet
    | EmailSubscription
    | Notification
    | ZaloSubscription
    | WalletAlert
    | WatchedWallet
    | FavoriteToken;

export const ENTITIES = [
    Token,
    OhlcCandle,
    Category,
    Transaction,
    SwapTrade,
    WalletSnapshot,
    MarketPriceEvent,
    User,
    Wallet,
    EmailSubscription,
    Notification,
    ZaloSubscription,
    WalletAlert,
    WatchedWallet,
    FavoriteToken
];
