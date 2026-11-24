import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  inspectAddress,
  isValidAddress,
  resolveAddressFamily,
  MEMO_SENSITIVE_FAMILIES,
} from "../src/index.mjs";

const { vectors } = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8"));

const FAMILIES = ["evm", "btc", "ltc", "doge", "bch", "zec", "sol", "tron", "near", "ton", "xrp", "stellar"];
const PITFALLS = [
  "evm-zero-address", "evm-bad-checksum", "ltc-legacy-3-prefix", "bch-legacy-base58", "xrp-x-address",
  "ton-testnet-or-masterchain", "zec-shielded-unsupported", "whitespace", "empty", "invalid-format",
];

test("vector file covers every family and every pitfall code", () => {
  for (const family of FAMILIES) {
    const own = vectors.filter((v) => v.family === family);
    assert.ok(own.filter((v) => v.expect.valid).length >= 4, `${family}: at least 4 valid vectors`);
    assert.ok(own.filter((v) => !v.expect.valid).length >= 4, `${family}: at least 4 invalid vectors`);
  }
  for (const pitfall of PITFALLS) {
    assert.ok(vectors.some((v) => v.expect.pitfall === pitfall), `pitfall ${pitfall} covered`);
  }
  for (const v of vectors) {
    assert.equal(typeof v.source, "string", `${v.address}: source`);
    assert.ok(v.source.length > 0, `${v.address}: source`);
    assert.ok(FAMILIES.includes(v.family), `${v.address}: family`);
    assert.equal(resolveAddressFamily(v.chain), v.family, `${v.chain} resolves to ${v.family}`);
  }
});

for (const family of FAMILIES) {
  test(`vectors: ${family}`, async () => {
    for (const v of vectors.filter((x) => x.family === family)) {
      const label = `${v.chain} ${JSON.stringify(v.address)} (${v.form})`;
      const report = await inspectAddress(v.chain, v.address);
      assert.deepEqual(
        report,
        { ...v.expect, family: v.family, memoSensitive: MEMO_SENSITIVE_FAMILIES.has(v.family) },
        label,
      );
      assert.equal(await isValidAddress(v.chain, v.address), v.expect.valid, `isValidAddress ${label}`);
    }
  });
}
