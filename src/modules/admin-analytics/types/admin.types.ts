/**
 * Admin Dashboard API Types
 *
 * All response shapes for the admin API. Copy or import these into your
 * frontend project to get full type coverage for every admin endpoint.
 *
 * Base URL prefix for all endpoints below: /api  (adjust to your frontend config)
 *
 * Auth: all endpoints require a Bearer JWT token belonging to a user with role "admin".
 */

// ---------------------------------------------------------------------------
// Internal: normalized swap record merged from swap_executions + transactions
// ---------------------------------------------------------------------------

export interface NormalizedSwap {
    id: string;
    signature: string;
    walletAddress: string;
    userId: string | null;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    volumeUsd: number | null;
    createdAt: Date;
    source: "swap_executions" | "transactions";
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export type ISODateString = string; // e.g. "2024-01-15T10:00:00.000Z"

// ---------------------------------------------------------------------------
// Analytics — GET /admin/analytics/overview
// Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// ---------------------------------------------------------------------------

export interface AdminOverview {
    totalUsers: number;
    newUsersInRange: number;
    totalSwaps: number;
    totalVolumeUsd: number;
    activeWalletsInRange: number;
}

// ---------------------------------------------------------------------------
// Analytics — GET /admin/analytics/users-over-time
// Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// ---------------------------------------------------------------------------

export interface TimeSeriesPoint {
    date: string; // "YYYY-MM-DD"
    count: number;
}

export type AdminUsersOverTime = TimeSeriesPoint[];

// ---------------------------------------------------------------------------
// Analytics — GET /admin/analytics/swaps-over-time
// Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// ---------------------------------------------------------------------------

export interface SwapTimeSeriesPoint {
    date: string; // "YYYY-MM-DD"
    count: number;
    volumeUsd: number;
}

export type AdminSwapsOverTime = SwapTimeSeriesPoint[];

// ---------------------------------------------------------------------------
// Analytics — GET /admin/analytics/top-tokens
// Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=10
// ---------------------------------------------------------------------------

export interface TopToken {
    mint: string;
    swapCount: number;
    volumeUsd: number;
}

export type AdminTopTokens = TopToken[];

// ---------------------------------------------------------------------------
// Analytics — GET /admin/analytics/recent-swaps
// Query: ?page=1&limit=20&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// ---------------------------------------------------------------------------

export interface RecentSwap {
    id: string;
    userId: string | null;
    walletAddress: string;
    signature: string;
    inputMint: string;
    outputMint: string;
    inAmount: string; // raw bigint as string
    outAmount: string; // raw bigint as string
    volumeUsd: number | null;
    createdAt: ISODateString;
}

export interface RecentSwapPage {
    swaps: RecentSwap[];
    total: number;
    page: number;
    limit: number;
}

// ---------------------------------------------------------------------------
// Analytics — GET /admin/analytics/volume-by-pair
// Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=10
// ---------------------------------------------------------------------------

export interface TokenPairVolume {
    inputMint: string;
    outputMint: string;
    swapCount: number;
    volumeUsd: number;
}

export type AdminVolumeByPair = TokenPairVolume[];

// ---------------------------------------------------------------------------
// User management — GET /users
// Query: ?search=&role=user|admin&isActive=true|false&page=1&limit=10
// ---------------------------------------------------------------------------

export type UserRole = "user" | "admin";
export type WalletType = "solana" | "phantom" | "solflare" | "backpack";
export type WalletIcon = "solsight" | "phantom" | "metamask" | "walletconnect" | "custom";

export interface AdminUserWalletSummary {
    id: string;
    address: string;
    chain: string;
    type: WalletType;
    name?: string;
    balance: number;
    isActive: boolean;
    isVerified: boolean;
    isDefault: boolean;
    createdAt: ISODateString;
}

export interface AdminUser {
    id: string;
    email: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    role: UserRole;
    isActive: boolean;
    isEmailVerified: boolean;
    oauthProvider?: string;
    lastLoginAt?: ISODateString | null;
    banReason?: string | null;
    adminNote?: string | null;
    createdAt: ISODateString;
    updatedAt: ISODateString;
    wallets: AdminUserWalletSummary[];
}

export interface AdminUserList {
    users: AdminUser[];
    total: number;
    page: number;
    limit: number;
}

// ---------------------------------------------------------------------------
// User management — GET /users/:id
// ---------------------------------------------------------------------------

export type AdminUserDetail = AdminUser;

// ---------------------------------------------------------------------------
// User management — PUT /users/:id/ban
// Body: { reason: string }
// ---------------------------------------------------------------------------

export interface BanUserRequest {
    reason: string;
}

// Response: AdminUser (isActive=false, banReason set)

// ---------------------------------------------------------------------------
// User management — PUT /users/:id/unban
// No body required
// Response: AdminUser (isActive=true, banReason=null)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// User management — PUT /users/:id/role
// Body: { role: UserRole }
// ---------------------------------------------------------------------------

export interface ChangeRoleRequest {
    role: UserRole;
}

// Response: AdminUser (role updated)

// ---------------------------------------------------------------------------
// User management — GET /users/:id/wallets
// ---------------------------------------------------------------------------

export type AdminUserWallets = AdminUserWalletSummary[];

// ---------------------------------------------------------------------------
// User management — GET /users/:id/swap-stats
// ---------------------------------------------------------------------------

export interface AdminUserSwapStats {
    totalSwaps: number;
    totalVolumeUsd: number;
    firstSwapAt: ISODateString | null;
    lastSwapAt: ISODateString | null;
}

// ---------------------------------------------------------------------------
// Admin notifications — POST /admin/notifications/broadcast
// POST /admin/notifications/user/:userId
// Body: BroadcastNotificationRequest
// ---------------------------------------------------------------------------

export interface BroadcastNotificationRequest {
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
}

export interface BroadcastNotificationResult {
    sent: number;
}

// ---------------------------------------------------------------------------
// Endpoint reference cheatsheet
// ---------------------------------------------------------------------------
//
// GET    /admin/analytics/overview            → AdminOverview
// GET    /admin/analytics/users-over-time     → AdminUsersOverTime
// GET    /admin/analytics/swaps-over-time     → AdminSwapsOverTime
// GET    /admin/analytics/top-tokens          → AdminTopTokens
// GET    /admin/analytics/recent-swaps        → RecentSwapPage
// GET    /admin/analytics/volume-by-pair      → AdminVolumeByPair
//
// GET    /users                               → AdminUserList
// GET    /users/:id                           → AdminUserDetail
// POST   /users                               body: CreateUserRequest → AdminUser
// PUT    /users/:id                           body: UpdateUserRequest → AdminUser
// DELETE /users/:id                           → { message: string }
// PUT    /users/:id/ban                       body: BanUserRequest → AdminUser
// PUT    /users/:id/unban                     → AdminUser
// PUT    /users/:id/role                      body: ChangeRoleRequest → AdminUser
// GET    /users/:id/wallets                   → AdminUserWallets
// GET    /users/:id/swap-stats                → AdminUserSwapStats
//
// POST   /admin/notifications/broadcast       body: BroadcastNotificationRequest → BroadcastNotificationResult
// POST   /admin/notifications/user/:userId    body: BroadcastNotificationRequest → BroadcastNotificationResult
