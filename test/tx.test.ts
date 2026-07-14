import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { nativeTxIdFromSignedBytes, retryableTransportError } from '../src/tx';

// Canonically-encoded signed tx: field 1 (0x0a) = raw_data, field 2 (0x12) = 65-byte signature.
const RAW_DATA = 'deadbeef';
const SIG = 'ab'.repeat(65);
const SIGNED = `0a04${RAW_DATA}1241${SIG}`;
const EXPECTED_TXID = createHash('sha256').update(Buffer.from(RAW_DATA, 'hex')).digest('hex');

test('derives the native txid as sha256(raw_data) from canonical signed bytes', () => {
  assert.equal(nativeTxIdFromSignedBytes(SIGNED), EXPECTED_TXID);
  assert.equal(nativeTxIdFromSignedBytes(`0x${SIGNED}`), EXPECTED_TXID);
});

test('rejects a transaction missing its signature', () => {
  assert.throws(() => nativeTxIdFromSignedBytes(`0a04${RAW_DATA}`), /missing a signature/i);
});

test('rejects a signature that is not 65 bytes', () => {
  assert.throws(() => nativeTxIdFromSignedBytes(`0a04${RAW_DATA}1204aabbccdd`), /must be 65 bytes/i);
});

test('rejects empty raw_data', () => {
  assert.throws(() => nativeTxIdFromSignedBytes(`0a001241${SIG}`), /empty raw_data/i);
});

test('rejects a signature that precedes raw_data', () => {
  assert.throws(() => nativeTxIdFromSignedBytes(`1241${SIG}0a04${RAW_DATA}`), /precedes raw_data/i);
});

test('rejects an unsupported protobuf field', () => {
  assert.throws(() => nativeTxIdFromSignedBytes('1a01aa'), /unsupported .* field/i);
});

test('rejects a noncanonical (overlong) varint tag', () => {
  // 0x8a 0x00 decodes to 0x0a but is not the canonical single-byte encoding.
  assert.throws(() => nativeTxIdFromSignedBytes(`8a0004${RAW_DATA}1241${SIG}`), /noncanonical/i);
});

test('rejects non-hex signed bytes', () => {
  assert.throws(() => nativeTxIdFromSignedBytes('nothex'), /invalid signed native transaction bytes/i);
});

// retryableTransportError — pure classification
test('classifies retryable HTTP statuses (408/429/5xx) and not 4xx', () => {
  assert.equal(retryableTransportError({ status: 500 }), true);
  assert.equal(retryableTransportError({ statusCode: 503 }), true);
  assert.equal(retryableTransportError({ status: 408 }), true);
  assert.equal(retryableTransportError({ status: 429 }), true);
  assert.equal(retryableTransportError({ status: 400 }), false);
  assert.equal(retryableTransportError({ status: 404 }), false);
});

test('classifies network error codes and message signals', () => {
  assert.equal(retryableTransportError({ code: 'ECONNRESET' }), true);
  assert.equal(retryableTransportError({ code: 'etimedout' }), true);
  assert.equal(retryableTransportError(new Error('fetch failed')), true);
  assert.equal(retryableTransportError(new Error('socket hang up')), true);
  assert.equal(retryableTransportError(new Error('nope')), false);
});

test('walks the cause chain and is cycle-safe', () => {
  assert.equal(retryableTransportError({ message: 'x', cause: { code: 'ETIMEDOUT' } }), true);
  const cyclic: Record<string, unknown> = { message: 'x' };
  cyclic.cause = cyclic;
  assert.equal(retryableTransportError(cyclic), false); // no infinite loop
});

// signBuiltTransaction / buildCreate / buildCall / serializeSignedTransaction hit tronweb
// signing + the node builder; they are covered by the live-TRE conformance suite (Phase 1.5).
test('build/sign/serialize are covered by live-TRE conformance', { skip: 'Phase 1.5 conformance (needs TRE + tronweb signing)' }, () => {});
