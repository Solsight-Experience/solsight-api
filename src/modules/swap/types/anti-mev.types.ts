/**
 * Anti-MEV RPC routing mode selected in the swap config panel.
 *
 * - `"off"`  — submit through the default (Helius) RPC path; fastest, unprotected.
 * - `"sec"`  — route through the Jito block engine with an embedded tip; protected
 *              from front-running/sandwich attacks. Mainnet-only (Jupiter executor).
 */
export type AntiMevRpc = "off" | "sec";

export const ANTI_MEV_RPC_VALUES: readonly AntiMevRpc[] = ["off", "sec"] as const;
