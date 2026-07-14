import assert from 'node:assert/strict';
import test from 'node:test';

import { jsonParseBigSafe } from '../src/json';

test('wraps integers >= 2^53 as strings, preserving every digit', () => {
  const parsed = jsonParseBigSafe('{"callValue": 999999999999999999}') as { callValue: string };
  assert.equal(parsed.callValue, '999999999999999999');
  assert.equal(BigInt(parsed.callValue), 999999999999999999n);
});

test('leaves safe integers as numbers', () => {
  const parsed = jsonParseBigSafe('{"a": 42, "b": 9007199254740991}') as { a: number; b: number };
  assert.equal(parsed.a, 42);
  assert.equal(typeof parsed.a, 'number');
  assert.equal(parsed.b, 9007199254740991); // 2^53 - 1, still exact
  assert.equal(typeof parsed.b, 'number');
});

test('handles large integers inside arrays and negatives', () => {
  const parsed = jsonParseBigSafe('[10000000000000000000, -20000000000000000000]') as string[];
  assert.deepEqual(parsed, ['10000000000000000000', '-20000000000000000000']);
  assert.equal(BigInt(parsed[0]!), 10000000000000000000n);
  assert.equal(BigInt(parsed[1]!), -20000000000000000000n);
});

test('is a no-op passthrough when no large integers are present', () => {
  assert.deepEqual(jsonParseBigSafe('{"x":[1,2,3],"y":"hello"}'), { x: [1, 2, 3], y: 'hello' });
});

// --- regressions for the regex bug (finding #1) ---

test('does NOT rewrite large digit sequences inside string values', () => {
  // The old regex matched the comma-delimited digits inside the string and
  // produced invalid JSON. A JSON-aware pass must leave the string intact.
  const parsed = jsonParseBigSafe('{"s":"prefix,12345678901234567,suffix"}') as { s: string };
  assert.equal(parsed.s, 'prefix,12345678901234567,suffix');
});

test('preserves large digits inside a string with an escaped quote', () => {
  const parsed = jsonParseBigSafe('{"s":"a\\"12345678901234567"}') as { s: string };
  assert.equal(parsed.s, 'a"12345678901234567');
});

test('wraps a bare root-level large integer (old regex missed this)', () => {
  assert.equal(jsonParseBigSafe('12345678901234567890'), '12345678901234567890');
});

test('does not wrap a quoted large integer or a float/exponent', () => {
  assert.equal((jsonParseBigSafe('{"s":"1234567890123456789"}') as { s: string }).s, '1234567890123456789');
  const f = jsonParseBigSafe('{"f": 12345678901234567.5, "e": 1.2345678901234567e3}') as { f: number; e: number };
  assert.equal(typeof f.f, 'number');
  assert.equal(typeof f.e, 'number');
});

test('preserves object keys that look like large numbers', () => {
  const parsed = jsonParseBigSafe('{"12345678901234567":"v","n":99999999999999999999}') as Record<string, unknown>;
  assert.equal(parsed['12345678901234567'], 'v');
  assert.equal(parsed.n, '99999999999999999999');
});
