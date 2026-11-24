import test from "node:test";
import assert from "node:assert/strict";
import * as validator from "../src/index.mjs";

const {
  inspectAddress,
  isValidAddress,
  resolveAddressFamily,
  MEMO_SENSITIVE_FAMILIES,
  validEvmAddress,
  evmChecksumStatus,
  validateStellarPublicKey,
} = validator;

test("exports exactly the documented API", () => {
  assert.deepEqual(Object.keys(validator).sort(), [
    "MEMO_SENSITIVE_FAMILIES",
    "evmChecksumStatus",
    "inspectAddress",
    "isValidAddress",
    "resolveAddressFamily",
    "validEvmAddress",
    "validateStellarPublicKey",
  ]);
});

test("resolveAddressFamily: family names, aliases and CAIP-2 ids", () => {
  const cases = {
    evm: "evm", eth: "evm", ETH: "evm", Ethereum: "evm", arb: "evm", base: "evm", bsc: "evm", op: "evm",
    pol: "evm", polygon: "evm", avax: "evm", " eth ": "evm",
    "eip155:1": "evm", "eip155:8453": "evm", "EIP155:42161": "evm",
    btc: "btc", bitcoin: "btc", Bitcoin: "btc", "bip122:000000000019d6689c085ae165831e93": "btc",
    "BIP122:000000000019D6689C085AE165831E93": "btc",
    ltc: "ltc", litecoin: "ltc", "bip122:12a765e31ffd4059bada1e25190f6e98": "ltc",
    doge: "doge", dogecoin: "doge", "bip122:1a91e3dace36e2be3bf030a65679fe82": "doge",
    bch: "bch", "bip122:000000000000000000651ef99cb9fcbe": "bch",
    zec: "zec", zcash: "zec", "bip122:0007104ccda289427919efc39dc9e4d4": "zec", "bip122:00040fe8ec8471911baa1db1266ea15d": "zec",
    sol: "sol", solana: "sol", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "sol",
    tron: "tron", trx: "tron", "tron:mainnet": "tron",
    near: "near", "near:mainnet": "near",
    ton: "ton", "ton:mainnet": "ton",
    xrp: "xrp", ripple: "xrp", xrpl: "xrp", "ripple:0": "xrp",
    stellar: "stellar", xlm: "stellar", "stellar:public": "stellar",
  };
  for (const [chain, family] of Object.entries(cases)) {
    assert.equal(resolveAddressFamily(chain), family, chain);
  }
});

test("resolveAddressFamily: unknown, malformed and prototype keys return null", () => {
  for (const chain of [
    "", "   ", "dogechain", "eip155:0", "eip155:01", "eip155:", "eip155:abc", "bip122:deadbeef",
    // CAIP-2 references are at most 32 characters
    `eip155:1${"0".repeat(32)}`, `eip155:${"9".repeat(33)}`,
    // CAIP-2 references are case-sensitive; only the exact Solana genesis-hash reference is known.
    "solana:5eykt4usfv8p8njdtrepy1vzqkqzkvdp",
    "constructor", "__proto__", "toString", "hasOwnProperty",
  ]) {
    assert.equal(resolveAddressFamily(chain), null, JSON.stringify(chain));
  }
  for (const chain of [undefined, null, 1, {}, ["eth"]]) {
    assert.equal(resolveAddressFamily(chain), null, String(chain));
  }
});

test("MEMO_SENSITIVE_FAMILIES lists the families that use a memo or destination tag", async () => {
  assert.ok(MEMO_SENSITIVE_FAMILIES instanceof Set);
  assert.deepEqual([...MEMO_SENSITIVE_FAMILIES].sort(), ["near", "stellar", "ton", "xrp"]);
  const memo = await inspectAddress("xrp", "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh");
  assert.equal(memo.memoSensitive, true);
  const noMemo = await inspectAddress("btc", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
  assert.equal(noMemo.memoSensitive, false);
  // memoSensitive is set from the family, also for invalid input
  assert.equal((await inspectAddress("ton", "")).memoSensitive, true);
});

test("eip155 references of up to 32 digits resolve", () => {
  assert.equal(resolveAddressFamily(`eip155:1${"0".repeat(31)}`), "evm");
  assert.equal(resolveAddressFamily(`eip155:${"9".repeat(32)}`), "evm");
});

test("changing the exported MEMO_SENSITIVE_FAMILIES does not change inspectAddress", async (t) => {
  const before = [...MEMO_SENSITIVE_FAMILIES];
  t.after(() => {
    MEMO_SENSITIVE_FAMILIES.clear();
    for (const family of before) MEMO_SENSITIVE_FAMILIES.add(family);
  });
  MEMO_SENSITIVE_FAMILIES.add("btc");
  MEMO_SENSITIVE_FAMILIES.delete("xrp");
  assert.equal((await inspectAddress("btc", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).memoSensitive, false);
  assert.equal((await inspectAddress("xrp", "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh")).memoSensitive, true);
  MEMO_SENSITIVE_FAMILIES.clear();
  assert.equal((await inspectAddress("ton", "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N")).memoSensitive, true);
});

test("legacy-format pitfalls are shape-only checks", async () => {
  // Not valid Base58Check, but shaped like the legacy formats, so the hint is still given.
  assert.equal((await inspectAddress("ltc", "3" + "1".repeat(30))).pitfall, "ltc-legacy-3-prefix");
  assert.equal((await inspectAddress("bch", "1" + "2".repeat(30))).pitfall, "bch-legacy-base58");
  assert.equal((await inspectAddress("xrp", "X" + "2".repeat(45))).pitfall, "xrp-x-address");
});

test("there is no memo text check; extra arguments are ignored", async () => {
  assert.equal("validateMemoText" in validator, false);
  const report = await inspectAddress("xrp", "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh", "123456");
  assert.deepEqual(Object.keys(report).sort(), ["checksum", "family", "memoSensitive", "pitfall", "valid"]);
});

test("inspectAddress returns null for an unknown chain; isValidAddress returns false", async () => {
  assert.equal(await inspectAddress("unknown-chain", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"), null);
  assert.equal(await isValidAddress("unknown-chain", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"), false);
});

test("non-string, whitespace, non-ASCII and over-long input", async () => {
  for (const value of [undefined, null, 42, {}, ""]) {
    assert.deepEqual(await inspectAddress("btc", value), {
      valid: false, family: "btc", checksum: "not-applicable", pitfall: "empty", memoSensitive: false,
    });
    assert.equal(await isValidAddress("btc", value), false);
  }
  for (const value of [" 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa\n", "wrap .near", "\t"]) {
    const family = resolveAddressFamily(value.includes("near") ? "near" : "btc");
    assert.equal((await inspectAddress(family, value)).pitfall, "whitespace", JSON.stringify(value));
    assert.equal(await isValidAddress(family, value), false);
  }
  // Cyrillic "а" in place of the last "a"
  assert.equal(await isValidAddress("eth", "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaeа"), false);
  assert.equal((await inspectAddress("near", "a".repeat(129) + ".near")).pitfall, "invalid-format");
  assert.equal(await isValidAddress("near", `${"a".repeat(60)}.near`), false, "over 64 characters");
});

test("validEvmAddress and evmChecksumStatus", () => {
  assert.equal(validEvmAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"), true);
  assert.equal(validEvmAddress("0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"), false);
  assert.equal(validEvmAddress("0x0000000000000000000000000000000000000000"), false);
  assert.equal(validEvmAddress(null), false);
  assert.equal(evmChecksumStatus("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"), "verified");
  assert.equal(evmChecksumStatus("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"), "unchecked-case");
  assert.equal(evmChecksumStatus("0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED"), "unchecked-case");
  assert.equal(evmChecksumStatus("0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"), "invalid-checksum");
  assert.equal(evmChecksumStatus("0x0000000000000000000000000000000000000000"), "not-applicable");
  assert.equal(evmChecksumStatus("not an address"), "not-applicable");
  assert.equal(evmChecksumStatus(undefined), "not-applicable");
});

test("validateStellarPublicKey", () => {
  assert.equal(validateStellarPublicKey("GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ"), true);
  assert.equal(validateStellarPublicKey("GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGY"), false);
  assert.equal(validateStellarPublicKey("G47QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVP2I"), false);
  assert.equal(validateStellarPublicKey("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"), false);
  assert.equal(validateStellarPublicKey(undefined), false);
});

test("without Web Crypto a Base58Check checksum is reported as skipped, never verified", async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true, writable: true });
  t.after(() => Object.defineProperty(globalThis, "crypto", descriptor));

  for (const [chain, address] of [
    ["tron", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"],
    ["btc", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"],
    ["btc", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"],
    ["ltc", "LUEweDxDA4WhvWiNXXSxjM9CYzHPJv4QQF"],
    ["doge", "DFxLFMAJWaNYA7TVTUstzPMFRSevAwTSLq"],
    ["zec", "t1UgqiRdoBVFrDkKnfKhTaSHZny7heNpLci"],
    ["xrp", "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"],
  ]) {
    const report = await inspectAddress(chain, address);
    assert.equal(report.valid, true, chain);
    assert.equal(report.checksum, "skipped", chain);
  }

  // The known limitation: a corrupted Base58Check checksum is not caught without Web Crypto.
  const corrupted = await inspectAddress("btc", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb");
  assert.deepEqual([corrupted.valid, corrupted.checksum], [true, "skipped"]);
  // Version byte, length and non-zero payload are still enforced.
  assert.equal(await isValidAddress("btc", "1111111111111111111114oLvT2"), false);
  assert.equal(await isValidAddress("ltc", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"), false);

  // Bech32/Bech32m, CashAddr, TON CRC16, Stellar CRC16 and EIP-55 need no Web Crypto.
  for (const [chain, address] of [
    ["btc", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"],
    ["btc", "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0"],
    ["ltc", "ltc1qvt5s0v2uhuna2sjnn84ldu8m2r4m3rcc3n0rm5"],
    ["bch", "bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a"],
    ["ton", "EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N"],
    ["stellar", "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ"],
    ["eth", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"],
  ]) {
    assert.equal((await inspectAddress(chain, address)).checksum, "verified", address);
  }
  assert.equal(await isValidAddress("btc", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5"), false);
});
