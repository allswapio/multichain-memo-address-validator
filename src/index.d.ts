export type AddressFamily =
  | "evm"
  | "btc"
  | "ltc"
  | "doge"
  | "bch"
  | "zec"
  | "sol"
  | "tron"
  | "near"
  | "ton"
  | "xrp"
  | "stellar";

/**
 * "verified": the address carries a checksum and it matched.
 * "unchecked-case": an all-lowercase or all-uppercase EVM address (no EIP-55 checksum to check).
 * "invalid-checksum": reported for EVM (EIP-55) and Stellar (CRC16) input whose checksum fails;
 *   other families report a failed checksum as valid: false, pitfall "invalid-format".
 * "not-applicable": no checksum in this format (Solana, NEAR, raw TON) or the input is invalid.
 * "skipped": a Base58Check checksum that could not be computed (no Web Crypto); the address
 *   was accepted without it.
 */
export type ChecksumStatus = "verified" | "unchecked-case" | "invalid-checksum" | "not-applicable" | "skipped";

export type AddressPitfallCode =
  | "none"
  | "empty"
  | "whitespace"
  | "evm-zero-address"
  | "evm-bad-checksum"
  | "ltc-legacy-3-prefix"
  | "bch-legacy-base58"
  | "xrp-x-address"
  | "ton-testnet-or-masterchain"
  | "zec-shielded-unsupported"
  | "invalid-format";

export interface AddressInspectionResult {
  valid: boolean;
  family: AddressFamily;
  checksum: ChecksumStatus;
  pitfall: AddressPitfallCode;
  /** The family commonly uses a memo or destination tag. The memo itself is not checked. */
  memoSensitive: boolean;
}

/** The families flagged memoSensitive. A copy: changing it does not change what the library returns. */
export declare const MEMO_SENSITIVE_FAMILIES: ReadonlySet<AddressFamily>;
export declare function resolveAddressFamily(chain: string): AddressFamily | null;
export declare function validEvmAddress(value: string): boolean;
export declare function evmChecksumStatus(value: string): ChecksumStatus;
export declare function validateStellarPublicKey(value: string): boolean;
export declare function isValidAddress(chain: string, value: string): Promise<boolean>;
export declare function inspectAddress(chain: string, address: string): Promise<AddressInspectionResult | null>;
