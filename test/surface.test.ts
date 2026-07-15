import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../src/index';
// Compile-time type surface — this import fails `tsc` if any public type is
// renamed or removed (types are erased at runtime, so the export-set test below
// can't catch them).
import type {
  NormalizedAddress,
  BuiltTransaction,
  Signer,
  BuildCreateOptions,
  BuildCallOptions,
  NormalizedInternalTransaction,
} from '../src/index';

const EXPECTED_FUNCTIONS = [
  'buildCall',
  'buildCreate',
  'decodeInternalTransactionNote',
  'jsonParseBigSafe',
  'nativeContractAddress',
  'nativeTxIdFromSignedBytes',
  'normalizeAddress',
  'normalizeInternalTransaction',
  'normalizeInternalTransactions',
  'retryableTransportError',
  'serializeSignedTransaction',
  'signBuiltTransaction',
  'toBase58Address',
  'toEvmAddress',
  'toTronHexAddress',
].sort();

test('public export set is exactly the declared surface (15 functions)', () => {
  const actual = Object.keys(api)
    .filter((k) => typeof (api as Record<string, unknown>)[k] === 'function')
    .sort();
  assert.deepEqual(actual, EXPECTED_FUNCTIONS);
});

test('decodeInternalTransactionNote decodes hex, passes non-hex through, fails closed on non-strings', () => {
  assert.equal(api.decodeInternalTransactionNote('637265617465'), 'create'); // hex("create")
  assert.equal(api.decodeInternalTransactionNote('0x637265617465'), 'create'); // tolerates 0x prefix
  assert.equal(api.decodeInternalTransactionNote('create'), 'create'); // non-hex passthrough
  assert.equal(api.decodeInternalTransactionNote(undefined), null);
  assert.equal(api.decodeInternalTransactionNote(123), null);
  assert.equal(api.decodeInternalTransactionNote(null), null);
});

// Reference the imported types so tsc genuinely checks them (erased at runtime).
type _PublicTypeSurface = [
  NormalizedAddress,
  BuiltTransaction,
  Signer,
  BuildCreateOptions,
  BuildCallOptions,
  NormalizedInternalTransaction,
];
