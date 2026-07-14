import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeInternalTransaction, normalizeInternalTransactions } from '../src/receipt';

const HASH = `0x${'a'.repeat(64)}`;
const CALLER = '41' + '1'.repeat(40); // TRON hex
const CHILD = '41' + '2'.repeat(40);
const CALLER_EVM = '0x' + '1'.repeat(40);
const CHILD_EVM = '0x' + '2'.repeat(40);

test('normalizes a create internal transaction to the canonical schema', () => {
  const out = normalizeInternalTransaction({
    hash: HASH,
    caller_address: CALLER,
    transferTo_address: CHILD,
    note: 'create',
    callValueInfo: [{ callValue: 1 }],
  });
  assert.deepEqual(out, {
    hash: HASH,
    callerAddress: CALLER_EVM,
    transferToAddress: CHILD_EVM,
    rawNote: 'create',
    decodedNote: 'create',
    valid: true,
    callValueInfo: [{ callValue: 1 }],
  });
});

test('decodes a hex-encoded note', () => {
  const hexCreate = Buffer.from('create', 'utf8').toString('hex');
  const out = normalizeInternalTransaction({ hash: HASH, caller_address: CALLER, transferTo_address: CHILD, note: hexCreate });
  assert.equal(out.rawNote, hexCreate);
  assert.equal(out.decodedNote, 'create');
});

test('surfaces a missing/non-string note as null (so consumers can fail closed)', () => {
  const missing = normalizeInternalTransaction({ hash: HASH, caller_address: CALLER, transferTo_address: CHILD });
  assert.equal(missing.rawNote, null);
  assert.equal(missing.decodedNote, null);
  const nonString = normalizeInternalTransaction({ hash: HASH, caller_address: CALLER, transferTo_address: CHILD, note: 123 });
  assert.equal(nonString.rawNote, null);
});

test('marks a rejected internal transaction invalid without dropping it', () => {
  const out = normalizeInternalTransaction({ hash: HASH, caller_address: CALLER, transferTo_address: CHILD, note: 'create', rejected: true });
  assert.equal(out.valid, false);
});

test('normalizes every entry and classifies none (rejected + non-create are kept)', () => {
  const list = normalizeInternalTransactions([
    { hash: HASH, caller_address: CALLER, transferTo_address: CHILD, note: 'create' },
    { hash: HASH, caller_address: CALLER, transferTo_address: CHILD, note: 'call', rejected: true },
    { hash: HASH, caller_address: CALLER, transferTo_address: CHILD, note: 'suicide' },
  ]);
  assert.equal(list.length, 3); // nothing filtered — classification is the consumer's job
  assert.deepEqual(list.map(t => t.decodedNote), ['create', 'call', 'suicide']);
  assert.deepEqual(list.map(t => t.valid), [true, false, true]);
});

test('rejects a bad rejected-marker and a non-array list', () => {
  assert.throws(() => normalizeInternalTransaction({ hash: HASH, caller_address: CALLER, transferTo_address: CHILD, rejected: 'yes' }), /rejected marker/i);
  assert.throws(() => normalizeInternalTransactions({} as unknown), /internal transaction list/i);
});
