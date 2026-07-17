import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeInternalTransactionNote } from '../src/receipt';

test('decodes a hex-encoded note to UTF-8', () => {
  const hexCreate = Buffer.from('create', 'utf8').toString('hex');
  assert.equal(decodeInternalTransactionNote(hexCreate), 'create');
});

test('tolerates a 0x-prefixed hex note', () => {
  assert.equal(decodeInternalTransactionNote('0x637265617465'), 'create');
});

test('passes a non-hex note through verbatim', () => {
  assert.equal(decodeInternalTransactionNote('create'), 'create');
  assert.equal(decodeInternalTransactionNote('call'), 'call');
  assert.equal(decodeInternalTransactionNote('suicide'), 'suicide');
});

test('returns null for an absent or non-string note (so consumers can fail closed)', () => {
  assert.equal(decodeInternalTransactionNote(undefined), null);
  assert.equal(decodeInternalTransactionNote(null), null);
  assert.equal(decodeInternalTransactionNote(123), null);
  assert.equal(decodeInternalTransactionNote({ note: 'create' }), null);
});

test('never classifies: decoding leaves "is this a CREATE?" to the consumer', () => {
  // An odd-length or non-hex string is NOT an error here — it comes back verbatim
  // (or null when absent); rejecting it is the consumer's fail-closed policy.
  assert.equal(decodeInternalTransactionNote('63726561746'), '63726561746'); // odd length → verbatim
  assert.equal(decodeInternalTransactionNote(''), '');
});
