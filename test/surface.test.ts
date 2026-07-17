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
} from '../src/index';

const EXPECTED_FUNCTIONS = [
  'buildCall',
  'buildCreate',
  'decodeInternalTransactionNote',
  'jsonParseBigSafe',
  'nativeContractAddress',
  'nativeTxIdFromSignedBytes',
  'normalizeAddress',
  'retryableTransportError',
  'serializeSignedTransaction',
  'signBuiltTransaction',
  'toBase58Address',
  'toEvmAddress',
  'toTronHexAddress',
].sort();

test('public export set is exactly the declared surface (13 functions)', () => {
  const actual = Object.keys(api).sort(); // ALL value exports, not just functions
  assert.deepEqual(actual, EXPECTED_FUNCTIONS);
});

// Reference the imported types so tsc genuinely checks them (erased at runtime).
type _PublicTypeSurface = [
  NormalizedAddress,
  BuiltTransaction,
  Signer,
  BuildCreateOptions,
  BuildCallOptions,
];
