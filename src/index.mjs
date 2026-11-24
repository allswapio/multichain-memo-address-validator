// Zero-dependency mainnet address validator with memo / destination tag flags.
// memoSensitive only says that a family commonly uses a memo or destination tag.
// There is no memo text check: one byte-length rule cannot fit every chain
// (an XRP destination tag is a uint32, a Stellar text memo is up to 28 bytes).

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const RIPPLE58 = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const BASE58_VERSIONS = Object.freeze({
  btc: [[0], [5]],
  ltc: [[0x30], [0x32]],
  doge: [[0x1e], [0x16]],
  zec: [[0x1c, 0xb8], [0x1c, 0xbd]],
  tron: [[0x41]],
  xrp: [[0]],
});

const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

const LANE_ROTATIONS = [
  [10, 1n], [7, 3n], [11, 6n], [17, 10n], [18, 15n], [3, 21n],
  [5, 28n], [16, 36n], [8, 45n], [21, 55n], [24, 2n], [4, 14n],
  [15, 27n], [23, 41n], [19, 56n], [13, 8n], [12, 25n], [2, 43n],
  [20, 62n], [14, 18n], [22, 39n], [9, 61n], [6, 20n], [1, 44n],
];

function rotate64(value, shift) {
  return BigInt.asUintN(64, (value << shift) | (value >> (64n - shift)));
}

function keccakF1600(state) {
  const column = Array(5);
  for (const round of ROUND_CONSTANTS) {
    for (let i = 0; i < 5; i++) {
      column[i] = state[i] ^ state[i + 5] ^ state[i + 10] ^ state[i + 15] ^ state[i + 20];
    }
    for (let i = 0; i < 5; i++) {
      const delta = column[(i + 4) % 5] ^ rotate64(column[(i + 1) % 5], 1n);
      for (let row = 0; row < 25; row += 5) state[row + i] ^= delta;
    }
    let previous = state[1];
    for (const [lane, shift] of LANE_ROTATIONS) {
      const next = state[lane];
      state[lane] = rotate64(previous, shift);
      previous = next;
    }
    for (let row = 0; row < 25; row += 5) {
      for (let i = 0; i < 5; i++) column[i] = state[row + i];
      for (let i = 0; i < 5; i++) state[row + i] = column[i] ^ (~column[(i + 1) % 5] & column[(i + 2) % 5]);
    }
    state[0] ^= round;
  }
}

export function validEvmAddress(value) {
  if (typeof value !== "string" || value.length !== 42 || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) {
    return false;
  }
  const digits = value.slice(2);
  const lower = digits.toLowerCase();
  if (digits === lower || digits === digits.toUpperCase()) return true;

  const state = Array(25).fill(0n);
  for (let i = 0; i < lower.length; i++) {
    const lane = Math.floor(i / 8);
    state[lane] |= BigInt(lower.charCodeAt(i)) << BigInt((i % 8) * 8);
  }
  state[5] = 0x01n;
  state[16] = 0x8000000000000000n;
  keccakF1600(state);

  for (let i = 0; i < lower.length; i++) {
    const letter = lower.charAt(i);
    if (letter < "a") continue;
    const shift = Math.floor((i % 16) / 2) * 8;
    const hashByte = Number((state[Math.floor(i / 16)] >> BigInt(shift)) & 0xffn);
    const nibble = i % 2 === 0 ? hashByte >> 4 : hashByte & 0x0f;
    if (digits[i] !== (nibble >= 8 ? letter.toUpperCase() : letter)) return false;
  }
  return true;
}

export function evmChecksumStatus(value) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) {
    return "not-applicable";
  }
  const hex = value.slice(2);
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) return "unchecked-case";
  return validEvmAddress(value) ? "verified" : "invalid-checksum";
}

function decode58(value, alphabet) {
  let magnitude = 0n;
  for (const ch of value) {
    const digit = alphabet.indexOf(ch);
    if (digit < 0) return null;
    magnitude = magnitude * 58n + BigInt(digit);
  }
  const bytes = [];
  while (magnitude > 0n) {
    bytes.push(Number(magnitude & 255n));
    magnitude >>= 8n;
  }
  for (const ch of value) {
    if (ch !== alphabet[0]) break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

async function validBase58Check(value, family) {
  const bytes = decode58(value, family === "xrp" ? RIPPLE58 : BASE58);
  if (!bytes || bytes.length < 5) return false;
  const payload = bytes.slice(0, -4);
  const prefixes = BASE58_VERSIONS[family];
  const matches = prefixes?.some(
    (prefix) =>
      payload.length === prefix.length + 20 &&
      prefix.every((byte, i) => byte === payload[i]) &&
      payload.subarray(prefix.length).some((byte) => byte !== 0),
  );
  if (!matches) return false;
  if (!globalThis.crypto?.subtle) return true;
  const first = await crypto.subtle.digest("SHA-256", payload);
  const checksum = new Uint8Array(await crypto.subtle.digest("SHA-256", first));
  return bytes.subarray(-4).every((byte, i) => byte === checksum[i]);
}

function unpack5to8(words) {
  let bits = 0;
  let accumulator = 0;
  const bytes = [];
  for (const word of words) {
    accumulator = (accumulator << 5) | word;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 255);
    }
  }
  return bits < 5 && (accumulator & ((1 << bits) - 1)) === 0 ? bytes : null;
}

function validSegwit(value, prefix) {
  const words = Array.from(value.slice(prefix.length + 1), (c) => BECH32.indexOf(c));
  if (words.length < 7 || words.includes(-1)) return false;
  const version = words[0];
  const program = unpack5to8(words.slice(1, -6));
  if (
    !program?.some((byte) => byte !== 0) ||
    !((version === 0 && (program.length === 20 || program.length === 32)) || (version === 1 && program.length === 32))
  ) {
    return false;
  }
  const hrp = Array.from(prefix, (c) => c.charCodeAt(0));
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const word of [...hrp.map((n) => n >> 5), 0, ...hrp.map((n) => n & 31), ...words]) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    generators.forEach((gen, i) => {
      if ((top >> i) & 1) checksum ^= gen;
    });
  }
  return checksum === (version === 0 ? 1 : 0x2bc830a3);
}

function validCashAddress(value) {
  const prefix = "bitcoincash";
  const words = Array.from(value.replace(/^bitcoincash:/, ""), (c) => BECH32.indexOf(c));
  if (words.length !== 42 || words.includes(-1)) return false;
  const payload = unpack5to8(words.slice(0, -8));
  if (!payload || !(payload[0] === 0 || payload[0] === 8) || !payload.slice(1).some(Boolean)) return false;
  const generators = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
  let checksum = 1n;
  for (const word of [...Array.from(prefix, (c) => c.charCodeAt(0) & 31), 0, ...words]) {
    const top = Number(checksum >> 35n);
    checksum = ((checksum & 0x07ffffffffn) << 5n) ^ BigInt(word);
    generators.forEach((gen, i) => {
      if ((top >> i) & 1) checksum ^= gen;
    });
  }
  return checksum === 1n;
}

function crc16XModem(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return crc;
}

function validTon(value) {
  if (/^0:(?:[0-9a-f]{64}|[0-9A-F]{64})$/.test(value)) return !/^0:0+$/.test(value);
  if (!/^(?:[A-Za-z0-9+/]{48}|[A-Za-z0-9_-]{48})$/.test(value)) return false;
  const bytes = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  if (!(bytes[0] === 0x11 || bytes[0] === 0x51) || bytes[1] !== 0 || !bytes.subarray(2, 34).some(Boolean)) return false;
  const crc = crc16XModem(bytes.subarray(0, 34));
  return (crc >> 8) === bytes[34] && (crc & 255) === bytes[35];
}

/** The 35 bytes of a 56-character G... StrKey, or null. Checks neither version byte nor CRC. */
function stellarStrKeyBytes(value) {
  if (typeof value !== "string" || !/^G[A-Z2-7]{55}$/.test(value)) return null;
  const bytes = new Uint8Array(35);
  let bits = 0;
  let acc = 0;
  let out = 0;
  for (const ch of value) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) return null;
    acc = (acc << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      if (out >= bytes.length) return null;
      bytes[out++] = (acc >> bits) & 0xff;
    }
  }
  return out === 35 && bits === 0 ? bytes : null;
}

function stellarCrcMatches(bytes) {
  const crc = crc16XModem(bytes.subarray(0, 33));
  return (crc & 0xff) === bytes[33] && (crc >> 8) === bytes[34];
}

export function validateStellarPublicKey(value) {
  const bytes = stellarStrKeyBytes(value);
  if (!bytes || bytes[0] !== 0x30 || !bytes.subarray(1, 33).some(Boolean)) return false;
  return stellarCrcMatches(bytes);
}

// Read by inspectAddress. Never exported, so callers cannot change the library's behaviour.
const MEMO_FAMILIES = new Set(["xrp", "stellar", "ton", "near"]);

/** A copy for callers. Changing it has no effect on this library. */
export const MEMO_SENSITIVE_FAMILIES = new Set(MEMO_FAMILIES);

const EVM_ALIASES = new Set([
  "evm", "eth", "ethereum", "arb", "arbitrum", "avax", "avalanche", "base", "bsc", "bnb",
  "op", "optimism", "pol", "polygon", "gnosis", "linea", "scroll", "mantle", "mode", "blast",
  "zksync", "zora", "berachain", "bera", "sonic", "monad", "abstract", "abs", "cronos",
  "hyperevm", "hypercore", "ink", "plasma", "world", "xlayer", "adi", "cyber", "robinhood",
]);

const FAMILY_ALIASES = Object.freeze({
  btc: "btc", bitcoin: "btc", "bip122:000000000019d6689c085ae165831e93": "btc",
  ltc: "ltc", litecoin: "ltc", "bip122:12a765e31ffd4059bada1e25190f6e98": "ltc",
  doge: "doge", dogecoin: "doge", "bip122:1a91e3dace36e2be3bf030a65679fe82": "doge",
  bch: "bch", "bip122:000000000000000000651ef99cb9fcbe": "bch",
  // Zcash: the chain id that AllSwap's public asset API (GET /api/v2/assets) returns for Zcash,
  // and the genesis-hash CAIP-2 id.
  zec: "zec", zcash: "zec", "bip122:0007104ccda289427919efc39dc9e4d4": "zec", "bip122:00040fe8ec8471911baa1db1266ea15d": "zec",
  sol: "sol", solana: "sol", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "sol",
  tron: "tron", trx: "tron", "tron:mainnet": "tron",
  near: "near", "near:mainnet": "near",
  ton: "ton", "ton:mainnet": "ton",
  xrp: "xrp", ripple: "xrp", xrpl: "xrp", "ripple:0": "xrp",
  stellar: "stellar", xlm: "stellar", "stellar:public": "stellar",
});

export function resolveAddressFamily(chain) {
  if (typeof chain !== "string") return null;
  const raw = chain.trim();
  if (!raw) return null;
  // CAIP-2 references are 1-32 characters.
  if (/^eip155:[1-9][0-9]{0,31}$/i.test(raw)) return "evm";
  if (Object.prototype.hasOwnProperty.call(FAMILY_ALIASES, raw)) return FAMILY_ALIASES[raw];
  const lower = raw.toLowerCase();
  if (EVM_ALIASES.has(lower)) return "evm";
  return Object.prototype.hasOwnProperty.call(FAMILY_ALIASES, lower) ? FAMILY_ALIASES[lower] : null;
}

export async function isValidAddress(chain, value) {
  if (typeof value !== "string" || !/^[!-~]{1,128}$/.test(value)) return false;
  const family = resolveAddressFamily(chain);
  if (!family) return false;
  if (family === "evm") return validEvmAddress(value);
  if (family === "ltc" && value.startsWith("ltc1")) return validSegwit(value, "ltc");
  if (family === "btc" && value.startsWith("bc1")) return validSegwit(value, "bc");
  if (Object.prototype.hasOwnProperty.call(BASE58_VERSIONS, family)) return validBase58Check(value, family);
  if (family === "bch") return validCashAddress(value);
  if (family === "sol") {
    const bytes = decode58(value, BASE58);
    return bytes?.length === 32 && bytes.some(Boolean);
  }
  if (family === "near") {
    if (value.length < 2 || value.length > 64 || !/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/.test(value)) return false;
    // Implicit (64 hex), ETH-implicit (0x + 40 hex) and deterministic (0s + 40 hex) accounts.
    return value.includes(".") || value.length < 32 || (/^(?:[a-f0-9]{64}|0[xs][a-f0-9]{40})$/.test(value) && !/^(?:0[xs])?0+$/.test(value));
  }
  if (family === "ton") return validTon(value);
  if (family === "stellar") return validateStellarPublicKey(value);
  return false;
}

/** True when this address is checked with Base58Check (its checksum needs Web Crypto). */
function usesBase58Check(family, address) {
  if (family === "btc") return !address.startsWith("bc1");
  if (family === "ltc") return !address.startsWith("ltc1");
  return family === "doge" || family === "zec" || family === "tron" || family === "xrp";
}

export async function inspectAddress(chain, address) {
  const family = resolveAddressFamily(chain);
  if (!family) return null;
  const memoSensitive = MEMO_FAMILIES.has(family);

  if (typeof address !== "string" || !address) {
    return { valid: false, family, checksum: "not-applicable", pitfall: "empty", memoSensitive };
  }
  if (address !== address.trim() || /\s/.test(address)) {
    return { valid: false, family, checksum: "not-applicable", pitfall: "whitespace", memoSensitive };
  }

  const valid = await isValidAddress(family, address);
  let checksum = "not-applicable";
  let pitfall = "none";

  if (family === "evm") {
    if (/^0x0{40}$/.test(address)) {
      pitfall = "evm-zero-address";
    } else {
      checksum = evmChecksumStatus(address);
      if (!valid) pitfall = checksum === "invalid-checksum" ? "evm-bad-checksum" : "invalid-format";
    }
  } else if (!valid) {
    if (family === "stellar") {
      const bytes = stellarStrKeyBytes(address);
      if (bytes && !stellarCrcMatches(bytes)) checksum = "invalid-checksum";
    }
    if (family === "ltc" && /^3[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address)) pitfall = "ltc-legacy-3-prefix";
    else if (family === "bch" && /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address)) pitfall = "bch-legacy-base58";
    else if (family === "xrp" && /^X[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(address)) pitfall = "xrp-x-address";
    else if (family === "ton" && (/^-1:[0-9a-fA-F]{64}$/.test(address) || /^(?:kQ|0Q|Ef|Uf|kf|0f)[A-Za-z0-9+/_-]{46}$/.test(address))) pitfall = "ton-testnet-or-masterchain";
    else if (family === "zec" && /^(?:zs1|u1|zc)[0-9a-zA-Z]{40,}$/.test(address)) pitfall = "zec-shielded-unsupported";
    else pitfall = "invalid-format";
  } else {
    const isRawTon = family === "ton" && address.startsWith("0:");
    checksum = family === "sol" || family === "near" || isRawTon
      ? "not-applicable"
      // validBase58Check skips the digest where Web Crypto is missing.
      : usesBase58Check(family, address) && !globalThis.crypto?.subtle ? "skipped" : "verified";
  }

  return { valid, family, checksum, pitfall, memoSensitive };
}
