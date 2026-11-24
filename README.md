# multichain-memo-address-validator

Checks whether a string is a well-formed **mainnet** address for one of 12 address families, verifies the
address checksum where the format has one, and tells you whether the family commonly needs a memo or
destination tag.

- No runtime dependencies. ESM only. Works in Node.js 22 or later and in browsers.
- Pure functions: no network calls, no configuration, and nothing a caller changes affects the results.

Maintained by [AllSwap](https://allswap.io). An interactive version runs at
<https://allswap.io/tools/address-validator>.

## Install

```sh
npm install multichain-memo-address-validator
```

## Usage

```js
import { inspectAddress, isValidAddress, resolveAddressFamily } from "multichain-memo-address-validator";

console.log(await isValidAddress("eip155:1", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"));
// true

console.log(await inspectAddress("xrp", "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"));
// { valid: true, family: 'xrp', checksum: 'verified', pitfall: 'none', memoSensitive: true }

console.log(await inspectAddress("ltc", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"));
// { valid: false, family: 'ltc', checksum: 'not-applicable', pitfall: 'ltc-legacy-3-prefix', memoSensitive: false }

console.log(await inspectAddress("eth", "0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"));
// { valid: false, family: 'evm', checksum: 'invalid-checksum', pitfall: 'evm-bad-checksum', memoSensitive: false }

console.log(resolveAddressFamily("bip122:000000000019d6689c085ae165831e93"));
// 'btc'
```

`isValidAddress` and `inspectAddress` are async because Base58Check uses SHA-256 from Web Crypto
(`crypto.subtle`).

## API

| Export | Returns | Description |
| :--- | :--- | :--- |
| `isValidAddress(chain, address)` | `Promise<boolean>` | `true` if `address` is accepted for the family `chain` resolves to. Unknown chain: `false`. |
| `inspectAddress(chain, address)` | `Promise<AddressInspectionResult \| null>` | `{ valid, family, checksum, pitfall, memoSensitive }`. Unknown chain: `null`. |
| `resolveAddressFamily(chain)` | `AddressFamily \| null` | Maps a family name, alias or CAIP-2 chain id to a family (see the table below). Case-insensitive except CAIP-2 references that are case-sensitive (Solana). |
| `MEMO_SENSITIVE_FAMILIES` | `ReadonlySet<AddressFamily>` | `near`, `ton`, `xrp`, `stellar`. A copy: changing it does not change what `inspectAddress` returns. |
| `validEvmAddress(value)` | `boolean` | Synchronous EVM check (`0x` + 40 hex, non-zero, EIP-55 when mixed case). |
| `evmChecksumStatus(value)` | `ChecksumStatus` | EIP-55 status of an EVM address. |
| `validateStellarPublicKey(value)` | `boolean` | Synchronous Stellar `G...` account check. |

TypeScript declarations ship in `src/index.d.ts`.

### `checksum`

| Value | Meaning |
| :--- | :--- |
| `verified` | The format has a checksum and it matched. |
| `unchecked-case` | EVM address in all lowercase or all uppercase: there is no EIP-55 checksum to verify. |
| `invalid-checksum` | EVM (EIP-55) or Stellar (CRC16) input whose checksum failed. Other families report a failed checksum as `valid: false` with `pitfall: "invalid-format"`. |
| `not-applicable` | The format has no checksum (Solana, NEAR, raw TON `0:<hex>`), or the input is invalid. |
| `skipped` | Web Crypto is not available, so a Base58Check checksum was not computed and the address was accepted without it. |

### `pitfall`

| Value | When |
| :--- | :--- |
| `none` | Valid address. |
| `empty` | Empty string or not a string. |
| `whitespace` | Leading, trailing or embedded whitespace. Nothing is trimmed. |
| `evm-zero-address` | `0x000...000`. |
| `evm-bad-checksum` | Mixed-case EVM address whose EIP-55 checksum does not match. |
| `ltc-legacy-3-prefix` | Litecoin legacy `3...` P2SH (byte-identical to a Bitcoin P2SH address). Shape only: the checksum is not checked. |
| `bch-legacy-base58` | Bitcoin Cash legacy `1...`/`3...` (byte-identical to a Bitcoin address). Shape only. |
| `xrp-x-address` | XRP `X...` address (it embeds a destination tag). Shape only. |
| `ton-testnet-or-masterchain` | TON `-1:` raw, masterchain `Ef`/`Uf`, or testnet `kQ`/`0Q`/`kf`/`0f` user-friendly form (shape only). |
| `zec-shielded-unsupported` | Zcash `zs1...`, `u1...` or `zc...` (shape only). |
| `invalid-format` | Anything else that is not accepted. |

## Supported families

| Family | `resolveAddressFamily` input | Accepted | Memo / tag family |
| :--- | :--- | :--- | :---: |
| `evm` | `evm`, `eth`, `ethereum`, `arb`, `base`, `bsc`, `op`, `pol`, `avax` and other EVM chain names, `eip155:<id>` | `0x` + 40 hex, not all zeros; mixed case must match EIP-55 | No |
| `btc` | `btc`, `bitcoin`, `bip122:000000000019d6689c085ae165831e93` | Base58Check P2PKH `1...`, P2SH `3...`; Bech32 `bc1q...` (v0, 20 or 32 bytes); Bech32m `bc1p...` (v1, 32 bytes) | No |
| `ltc` | `ltc`, `litecoin`, `bip122:12a765e31ffd4059bada1e25190f6e98` | `L...`, `M...`, `ltc1q...`, `ltc1p...`; legacy `3...` refused | No |
| `doge` | `doge`, `dogecoin`, `bip122:1a91e3dace36e2be3bf030a65679fe82` | Base58Check `D...`, `9...`, `A...` | No |
| `bch` | `bch`, `bip122:000000000000000000651ef99cb9fcbe` | Lowercase CashAddr `q...`/`p...` with a 20-byte hash, with or without `bitcoincash:`; legacy Base58 refused | No |
| `zec` | `zec`, `zcash`, `bip122:00040fe8ec8471911baa1db1266ea15d` (the genesis-hash CAIP-2 id), `bip122:0007104ccda289427919efc39dc9e4d4` (the chain id that AllSwap's public asset API (`GET /api/v2/assets`) returns for Zcash) | Transparent Base58Check `t1...`, `t3...` | No |
| `sol` | `sol`, `solana`, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | Base58 that decodes to 32 bytes, not all zeros | No |
| `tron` | `tron`, `trx`, `tron:mainnet` | Base58Check `T...` (version byte `0x41`), not all zeros | No |
| `near` | `near`, `near:mainnet` | Named account (2-64 chars, `a-z 0-9` with single `-` `_` `.` separators; see Limitations for long names without a dot), 64-hex implicit account, `0x` + 40 lowercase hex ETH-implicit account, `0s` + 40 lowercase hex deterministic account | Yes |
| `ton` | `ton`, `ton:mainnet` | Basechain only: raw `0:<64 hex>` (all lowercase or all uppercase), or 48-char user-friendly `EQ...`/`UQ...` (standard or URL-safe Base64, CRC16 checked) | Yes |
| `xrp` | `xrp`, `ripple`, `xrpl`, `ripple:0` | Classic `r...` (Ripple Base58Check), not all zeros; `X...` refused | Yes |
| `stellar` | `stellar`, `xlm`, `stellar:public` | 56-char `G...` StrKey account (Base32, CRC16) | Yes |

`eip155:<id>` (reference of 1-32 digits), the `bip122:` ids and `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`
are CAIP-2 chain ids. `tron:mainnet`, `ton:mainnet`, `ripple:0` and `near:mainnet` are aliases: the chain ids
AllSwap's public asset API uses for those chains. `stellar:public` is a plain alias.

## Limitations

- **Mainnet only.** Testnet, regtest and devnet formats are refused.
- **Format only.** A valid result does not mean the account exists, is controlled by anyone, can receive a
  given asset, or is not a contract. Well-known system and burn addresses with a non-zero payload are accepted.
- **No memo validation.** `memoSensitive: true` only says that the family commonly uses a memo or
  destination tag (exchanges and custodial wallets often require one). The library never inspects a memo.
- **Lowercase only** for Bech32 and CashAddr, although both specifications also allow all-uppercase strings.
- **EVM:** an all-uppercase address is accepted with `checksum: "unchecked-case"`.
- **Without Web Crypto** (`globalThis.crypto.subtle`), Base58Check addresses (`btc`/`ltc` legacy, `doge`,
  `zec`, `tron`, `xrp`) are accepted without their checksum and reported as `checksum: "skipped"`.
  Node.js 22+ has Web Crypto. Browsers expose `crypto.subtle` only in secure contexts (HTTPS or
  `localhost`), so on a plain-HTTP page Base58Check checksums are `skipped`.
- **NEAR names:** NEAR's account-ID rules allow any name of 2-64 characters. This library deliberately refuses
  a top-level name without a dot of 32 or more characters unless it is an implicit (64 hex), ETH-implicit
  (`0x` + 40 hex) or deterministic (`0s` + 40 hex) account: such names are rarely used as wallets, and
  lowercase addresses of other chains (Bech32, CashAddr without its prefix) would otherwise pass as NEAR
  accounts. NEAR universal accounts (`0u...`) are not accepted.
- Not supported: Bitcoin Cash token-aware or 32-byte CashAddr, Zcash shielded and unified addresses, Stellar
  muxed (`M...`) accounts, XRP X-addresses, TON masterchain, NEAR universal accounts, segwit versions other than 0 and 1, and all-zero
  keys or hashes.
- Input longer than 128 characters, or containing anything other than visible ASCII, is refused.

## Tests

```sh
npm test
```

`test/vectors.json` lists every test address with its source: specification vectors (EIP-55, BIP-173,
BIP-350, BIP-86, CashAddr, SEP-23, XLS-5d), examples from the XRPL and NEAR documentation, well-known public
contract, system and genesis addresses, and deterministic re-encodings of published hashes and keys.

## Security

Please report vulnerabilities privately to service@allswap.io. See [SECURITY.md](SECURITY.md).

## License inquiries

Questions about the licensing of this software or of anything it contains: service@allswap.io.

## License

[MIT](LICENSE). Copyright (c) 2026 Haohang Network Technology Co., Limited (AllSwap).
