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

test('does not corrupt long digit strings that are already quoted', () => {
  const parsed = jsonParseBigSafe('{"s": "1234567890123456789"}') as { s: string };
  assert.equal(parsed.s, '1234567890123456789');
});
