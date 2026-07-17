#!/usr/bin/env node
// Live-TRE conformance for @openzeppelin/tron-runtime.
//
// Exercises the extracted primitives against a REAL java-tron node: build + sign
// through the injected TronWeb, broadcast the exact signed bytes, confirm the node
// computes the SAME txid, require a SUCCESSFUL deploy, and decode a NON-EMPTY real
// internal-transaction trace through the shared receipt primitive.
//
// NON-SKIPPABLE: exits 1 if a TRE endpoint is unreachable.
// Pinned authority: tronbox/tre@sha256:e57deeb0d8201498549dbec28e7c329d8647ef0976b547cfbb6fa6a41a10f491
import assert from 'node:assert/strict';
import { TronWeb } from 'tronweb';

// Load the COMPILED package through its own export map (require → dist/index.js),
// NOT the TypeScript source. This gate must exercise exactly what a consumer
// installs: the emitted CommonJS and the `exports` resolution. The
// `typeof import('../src/index')` cast keeps compile-time types bound to source
// (so typecheck still covers this script) without importing source at runtime.
// `npm run conformance` builds `dist` first, so this resolves.
const { buildCreate, nativeTxIdFromSignedBytes, decodeInternalTransactionNote, toEvmAddress } =
  require('@openzeppelin/tron-runtime') as typeof import('../src/index');

const RPC = process.env.TRON_RPC_URL;
// A funded TRE dev account (tronbox/tre default). Never used on a real network.
const KEY = process.env.TRON_PRIVATE_KEY ?? 'dd23ca549a97cb330b011aebb674730df8b14acaee42d211ab45692699ab8ba5';
// Constructor performs two internal CREATEs (one succeeds, one reverts) then returns
// an empty runtime, so the top-level deploy SUCCEEDS with a non-empty internal trace.
const FACTORY_INITCODE = '0x6000600053600160006000f0506460006000fd6000526005601b6000f05060006000f3';

interface BroadcastResult {
  result?: boolean;
  code?: string;
  txid?: string;
}
interface ReceiptInfo {
  id?: string;
  receipt?: { result?: string };
  internal_transactions?: unknown[];
}

if (!RPC) {
  console.error('CONFORMANCE FAILED: TRON_RPC_URL is not set. A live TRE is required — this gate does not skip.');
  process.exit(1);
}
const base = RPC.replace(/\/$/, '');

async function request<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  const tronWeb = new TronWeb({ fullHost: base, privateKey: KEY });
  const signer = { privateKey: KEY, feeLimit: 1_000_000_000 };

  // 1. build + sign through the runtime, against the real node's transaction builder
  const built = await buildCreate(tronWeb, { abi: [], bytecode: FACTORY_INITCODE, name: 'Conformance', callValue: 0 }, signer);

  // 2. our txid re-derives from the signed bytes
  assert.equal(built.nativeTransactionId, nativeTxIdFromSignedBytes(built.signedNativeTransaction), 'txid re-derivation');

  // 3. the node accepts the EXACT signed bytes and reports the SAME txid
  const broadcast = await request<BroadcastResult>('/wallet/broadcasthex', { transaction: built.signedNativeTransaction });
  const dup = typeof broadcast.code === 'string' && /DUP_TRANSACTION/i.test(broadcast.code);
  assert.ok(broadcast.result === true || dup, `node rejected the signed bytes: ${JSON.stringify(broadcast)}`);
  if (broadcast.txid) assert.equal(broadcast.txid.toLowerCase(), built.nativeTransactionId, 'node txid == runtime txid');

  // 4. confirm a SUCCESSFUL deploy and a NON-EMPTY internal-transaction trace
  let info: ReceiptInfo | undefined;
  for (let i = 0; i < 40; i += 1) {
    info = await request<ReceiptInfo>('/wallet/gettransactioninfobyid', { value: built.nativeTransactionId });
    if (info && info.id) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(info && info.id, 'no receipt returned by the node');
  assert.equal(info.id.toLowerCase(), built.nativeTransactionId, 'receipt id == runtime txid');
  assert.equal(info.receipt?.result, 'SUCCESS', `deploy did not succeed: ${String(info.receipt?.result)}`);

  const internal = info.internal_transactions ?? [];
  // The factory constructor performs EXACTLY two internal CREATEs — one that
  // succeeds and one that reverts — so this trace has a fixed, asserted shape.
  assert.equal(internal.length, 2, `expected exactly two internal CREATEs; got ${internal.length}`);

  // 5. decode the REAL trace through the shared receipt primitive and validate the
  // raw per-entry fields the consumers actually read (traces stay raw by design —
  // classification and any further shaping are consumer policy, not the runtime's).
  const rawEntries = internal as Array<Record<string, unknown>>;
  for (const raw of rawEntries) {
    assert.match(String(raw.hash), /^(?:0x)?[0-9a-f]{64}$/i, 'internal-tx hash is 32 bytes of hex');
    assert.match(toEvmAddress(String(raw.caller_address)), /^0x[0-9a-f]{40}$/, 'caller converts to an EVM address');
    assert.match(toEvmAddress(String(raw.transferTo_address)), /^0x[0-9a-f]{40}$/, 'created child converts to an EVM address');
    assert.equal(decodeInternalTransactionNote(raw.note), 'create', `expected a decoded CREATE note; got ${String(raw.note)}`);
    assert.ok(raw.rejected === undefined || typeof raw.rejected === 'boolean', 'rejected marker is boolean when present');
  }
  // The decoder fails closed on an absent note (what consumers rely on to reject
  // malformed entries) — assert it against the same live-node payload shape.
  assert.equal(decodeInternalTransactionNote((rawEntries[0] as { missing?: unknown }).missing), null, 'absent note decodes to null');
  // The factory produces exactly one accepted + one rejected CREATE — read the raw
  // `rejected` markers per-entry, exactly as the consumers do.
  assert.equal(rawEntries.filter((raw) => raw.rejected !== true).length, 1, 'expected exactly one accepted internal CREATE');
  assert.equal(rawEntries.filter((raw) => raw.rejected === true).length, 1, 'expected exactly one rejected internal CREATE');

  console.log(`✓ live-TRE conformance passed against ${base}`);
  console.log(
    `  runtime txid: ${built.nativeTransactionId} · deploy: ${String(info.receipt?.result)} · internal txns decoded: ${rawEntries.length}`,
  );
}

main().catch((error: unknown) => {
  console.error('CONFORMANCE FAILED:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
