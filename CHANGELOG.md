# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-25

First public release.

### Added

- `isValidAddress`, `inspectAddress`, `resolveAddressFamily`, `MEMO_SENSITIVE_FAMILIES`,
  `validEvmAddress`, `evmChecksumStatus` and `validateStellarPublicKey`.
- Mainnet address families: `evm`, `btc`, `ltc`, `doge`, `bch`, `zec`, `sol`, `tron`, `near`, `ton`,
  `xrp`, `stellar`.
- Checksums: EIP-55 (Keccak-256), Base58Check (SHA-256 via Web Crypto), Bech32 and Bech32m, CashAddr,
  CRC16-XModem (TON, Stellar).
- Pitfall codes for common mistakes (EVM zero address and bad checksum, Litecoin legacy `3...`, Bitcoin
  Cash legacy Base58, XRP X-addresses, TON testnet and masterchain, Zcash shielded addresses,
  whitespace, empty input).
- TypeScript declarations.
- NEAR implicit, ETH-implicit and deterministic (`0s...`) accounts.
- Requires Node.js 22 or later.
- Test vectors with a stated source for every address (`test/vectors.json`).

[1.0.0]: https://github.com/allswapio/multichain-memo-address-validator/releases/tag/v1.0.0
