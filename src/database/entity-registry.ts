import { Token } from "../modules/tokens/entities/token.entity";
import { OhlcCandle } from "../modules/tokens/entities/ohlc-candle.entity";
import { Category } from "../modules/tokens/entities/category.entity";
import { Transaction } from "../modules/transactions/entities/transaction.entity";
import { WalletSnapshot } from "../modules/portfolio/entities/wallet-snapshot.entity";
import { MarketPriceEvent } from "../modules/indexer/entities/market-price-event.entity";
import { User } from "../modules/users/entities/user.entity";
import { Wallet } from "../modules/wallets/entities/wallet.entity";
import { EmailSubscription } from "../modules/email/entities/email-subscription.entity";
import { Notification } from "../modules/notifications/entities/notification.entity";
import { BotSubscription } from "../modules/bot/entities/bot-subscription.entity";
import { WalletAlert } from "../modules/watchlist/entities/wallet-alert.entity";
import { WatchedWallet } from "../modules/watchlist/entities/watched-wallet.entity";
import { Favorite } from "../modules/account/entities/favorite.entity";
import { UserCredit } from "../modules/billing/entities/user-credit.entity";
import { FeatureUsage } from "../modules/billing/entities/feature-usage.entity";
import { PaymentOrder } from "../modules/billing/entities/payment-order.entity";

export type AppEntity =
    | Token
    | OhlcCandle
    | Category
    | Transaction
    | WalletSnapshot
    | MarketPriceEvent
    | User
    | Wallet
    | EmailSubscription
    | Notification
    | BotSubscription
    | WalletAlert
    | WatchedWallet
    | Favorite
    | UserCredit
    | FeatureUsage
    | PaymentOrder;

export const ENTITIES = [
    Token,
    OhlcCandle,
    Category,
    Transaction,
    WalletSnapshot,
    MarketPriceEvent,
    User,
    Wallet,
    EmailSubscription,
    Notification,
    BotSubscription,
    WalletAlert,
    WatchedWallet,
    Favorite,
    UserCredit,
    FeatureUsage,
    PaymentOrder
];
