import assert from 'node:assert/strict';
import test from 'node:test';

import { TronWeb } from 'tronweb';

import { toTronHexAddress } from '../src/address';
import { buildCall, buildCreate, nativeTxIdFromSignedBytes, retryableTransportError } from '../src/tx';

// ---- canonical signed-tx / txid vectors (pinned literals, independent of the code under test) ----
const RAW_DATA = 'deadbeef';
const SIG = 'ab'.repeat(65);
const SIGNED = `0a04${RAW_DATA}1241${SIG}`;
// Fixed golden: sha256 of the raw_data bytes (0xdeadbeef).
const EXPECTED_TXID = '5f78c33274e43fa9de5659265c1d917e25c03722dcb0b8d27db8d5feaa813953';

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
  assert.throws(() => nativeTxIdFromSignedBytes(`8a0004${RAW_DATA}1241${SIG}`), /noncanonical/i);
});
test('rejects non-hex signed bytes', () => {
  assert.throws(() => nativeTxIdFromSignedBytes('nothex'), /invalid signed native transaction bytes/i);
});

// ---- retryableTransportError (pure classification) ----
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
  assert.equal(retryableTransportError(cyclic), false);
});

// ---- build/sign/serialize (offline: injected mock TronWeb + one real-TronWeb path) ----
const PRIVATE_KEY = '01'.repeat(32);
const SIGNER = { privateKey: PRIVATE_KEY, feeLimit: 1_000_000_000 };
const OWNER_EVM = `0x${'11'.repeat(20)}`;
const OWNER_HEX = toTronHexAddress(OWNER_EVM);
const CONTRACT_EVM = `0x${'22'.repeat(20)}`;
const CONTRACT_HEX = toTronHexAddress(CONTRACT_EVM);

interface Call { method: string; options?: unknown; owner?: string; address?: string }
function mockTronWeb(triggerReturn?: unknown): { calls: Call[]; tronWeb: TronWeb } {
  const calls: Call[] = [];
  const builder = {
    createSmartContract: async (options: unknown, owner: string) => {
      calls.push({ method: 'createSmartContract', options, owner });
      throw new Error('BUILDER_REACHED');
    },
    triggerSmartContract: async (address: string, _selector: string, options: unknown, _params: unknown[], owner: string) => {
      calls.push({ method: 'triggerSmartContract', address, options, owner });
      if (triggerReturn !== undefined) return triggerReturn;
      throw new Error('BUILDER_REACHED');
    },
  };
  const tronWeb = { defaultAddress: { hex: OWNER_HEX }, trx: { sign: async (tx: unknown) => tx }, transactionBuilder: builder };
  return { calls, tronWeb: tronWeb as unknown as TronWeb };
}

test('buildCreate forwards normalized builder args (stripped bytecode, exact call value, owner hex)', async () => {
  const { calls, tronWeb } = mockTronWeb();
  const abi = [{ type: 'constructor', inputs: [{ name: 'value', type: 'uint256' }] }];
  await assert.rejects(
    buildCreate(tronWeb, { abi, bytecode: '0x60006000', constructorData: `0x${'00'.repeat(31)}2a`, ownerAddress: OWNER_EVM, name: 'Box', callValue: 7 }, SIGNER),
    /BUILDER_REACHED/,
  );
  assert.equal(calls[0]!.owner, OWNER_HEX);
  assert.deepEqual(calls[0]!.options, { abi, bytecode: '60006000', callValue: 7, feeLimit: 1_000_000_000, name: 'Box', rawParameter: `${'00'.repeat(31)}2a` });
});

test('buildCall forwards normalized builder args (address hex, input, txLocal)', async () => {
  const { calls, tronWeb } = mockTronWeb();
  await assert.rejects(
    buildCall(tronWeb, { contractAddress: CONTRACT_EVM, data: '0x1234', ownerAddress: OWNER_EVM, callValue: 11 }, SIGNER),
    /BUILDER_REACHED/,
  );
  assert.equal(calls[0]!.address, CONTRACT_HEX);
  assert.equal(calls[0]!.owner, OWNER_HEX);
  assert.deepEqual(calls[0]!.options, { callValue: 11, feeLimit: 1_000_000_000, input: '1234', txLocal: true });
});

// Regressions for the Codex faithfulness findings — all must fail closed BEFORE the builder runs.
test('fails closed on explicit null callValue/constructorData/data (no builder call)', async () => {
  const a = mockTronWeb();
  await assert.rejects(buildCreate(a.tronWeb, { abi: [], bytecode: '0x00', callValue: null as unknown as number }, SIGNER), /call value/i);
  assert.equal(a.calls.length, 0);
  const b = mockTronWeb();
  await assert.rejects(buildCreate(b.tronWeb, { abi: [], bytecode: '0x00', constructorData: null as unknown as string }, SIGNER), /constructor data/i);
  assert.equal(b.calls.length, 0);
  const c = mockTronWeb();
  await assert.rejects(buildCall(c.tronWeb, { contractAddress: CONTRACT_EVM, data: null as unknown as string }, SIGNER), /call data/i);
  assert.equal(c.calls.length, 0);
});

test('validates the injected signer before building', async () => {
  const a = mockTronWeb();
  await assert.rejects(buildCreate(a.tronWeb, { abi: [], bytecode: '0x00' }, { privateKey: PRIVATE_KEY, feeLimit: -1 } as unknown as typeof SIGNER), /signer/i);
  assert.equal(a.calls.length, 0);
  const b = mockTronWeb();
  await assert.rejects(buildCall(b.tronWeb, { contractAddress: CONTRACT_EVM }, { privateKey: 'zz', feeLimit: 1 } as unknown as typeof SIGNER), /signer/i);
  assert.equal(b.calls.length, 0);
});

test('missing options yields a domain error, not a raw TypeError', async () => {
  const a = mockTronWeb();
  await assert.rejects(buildCreate(a.tronWeb, undefined as unknown as never, SIGNER), /contract ABI/i);
  assert.equal(a.calls.length, 0);
  const b = mockTronWeb();
  await assert.rejects(buildCall(b.tronWeb, undefined as unknown as never, SIGNER), /invalid TRON address/i);
  assert.equal(b.calls.length, 0);
});

test('rejects a malformed (array-shaped) or unsuccessful prebuild wrapper', async () => {
  const arrayWrapper = Object.assign([], { result: { result: true }, transaction: {} });
  await assert.rejects(buildCall(mockTronWeb(arrayWrapper).tronWeb, { contractAddress: CONTRACT_EVM, data: '0x12' }, SIGNER), /prebuild failed/i);
  const failWrapper = { result: { result: false, message: 'nope' } };
  await assert.rejects(buildCall(mockTronWeb(failWrapper).tronWeb, { contractAddress: CONTRACT_EVM, data: '0x12' }, SIGNER), /prebuild failed: nope/i);
});

test('accepts exact safe call values (bigint/string/number) and rejects lossy/invalid ones', async () => {
  const max = Number.MAX_SAFE_INTEGER;
  for (const value of [BigInt(max), String(max), max]) {
    const { calls, tronWeb } = mockTronWeb();
    await assert.rejects(buildCall(tronWeb, { contractAddress: CONTRACT_EVM, data: '0x12', callValue: value }, SIGNER), /BUILDER_REACHED/);
    assert.equal((calls[0]!.options as { callValue: number }).callValue, max);
  }
  for (const value of [BigInt(max) + 1n, String(BigInt(max) + 1n), -1, 1.5, '1e3', null]) {
    const { calls, tronWeb } = mockTronWeb();
    await assert.rejects(buildCall(tronWeb, { contractAddress: CONTRACT_EVM, data: '0x12', callValue: value as never }, SIGNER), /call value/i);
    assert.equal(calls.length, 0);
  }
});

// Pinned deterministic golden for the full offline build → sign → serialize path
// (fixed key + fixed ref-block params + fixed inputs; tronweb signs deterministically).
const GOLDEN_BUILD_TXID = 'a8390d0c944d7d8475dcc95972efecdcdf75d5f9fccccbec2085ade60f74d836';
const GOLDEN_BUILD_BYTES =
  '0aad010a0212342208010203040506070840e0a499ffbc315a8701081e1282010a30747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e437265617465536d617274436f6e7472616374124e0a15411a642f0e3c3af545e7acbd38b07251b3990914f112350a15411a642f0e3c3af545e7acbd38b07251b3990914f11a060a0430014004220460001234280a30643a0545786163744080ade2047080d095ffbc3190018094ebdc031241e8ede96f3cf7ef51c5c9d03eab170a374122c6f2294fd4622a07d7ebb45c1571006638a94134763c4a5ffddba95b4f33f75765ba7171bb510a10d3960412d6b91c';

test('builds, signs and serializes offline to a pinned deterministic vector', async () => {
  const tronWeb = new TronWeb({ fullHost: 'http://127.0.0.1:9090', privateKey: PRIVATE_KEY });
  (tronWeb.trx as unknown as { getCurrentRefBlockParams: () => Promise<unknown> }).getCurrentRefBlockParams = async () => ({
    ref_block_bytes: '1234',
    ref_block_hash: '0102030405060708',
    expiration: 1_700_000_060_000,
    timestamp: 1_700_000_000_000,
  });
  const built = await buildCreate(
    tronWeb,
    { abi: [{ type: 'constructor', inputs: [], stateMutability: 'payable' }], bytecode: '0x6000', constructorData: '0x1234', name: 'Exact', callValue: '10' },
    SIGNER,
  );
  assert.equal(built.signedNativeTransaction, GOLDEN_BUILD_BYTES);
  assert.equal(built.nativeTransactionId, GOLDEN_BUILD_TXID);
  assert.equal(nativeTxIdFromSignedBytes(built.signedNativeTransaction), GOLDEN_BUILD_TXID);
  assert.equal((built.transaction as { txID: string }).txID, GOLDEN_BUILD_TXID);
});
