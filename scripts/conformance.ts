#!/usr/bin/env node
// Live-TRE conformance for @openzeppelin/tron-runtime (Phase 1.5).
//
// Exercises the extracted primitives against a REAL java-tron node: build + sign
// through the injected TronWeb, broadcast the exact signed bytes, confirm the node
// computes the SAME txid, require a SUCCESSFUL deploy, and normalize a NON-EMPTY
// real internal-transaction trace.
//
// NON-SKIPPABLE: exits 1 if a TRE endpoint is unreachable.
// Pinned authority: tronbox/tre@sha256:e57deeb0d8201498549dbec28e7c329d8647ef0976b547cfbb6fa6a41a10f491
import assert from 'node:assert/strict';
import { TronWeb } from 'tronweb';

import { buildCreate, nativeTxIdFromSignedBytes, normalizeInternalTransactions } from '../src/index';

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
  assert.ok(internal.length >= 1, 'expected a non-empty internal-transaction trace from the factory initcode');

  // 5. normalize the REAL trace and validate the canonical fields
  const normalized = normalizeInternalTransactions(internal);
  assert.equal(normalized.length, internal.length, 'normalization keeps every entry (no classification/filtering)');
  for (const tx of normalized) {
    assert.match(tx.callerAddress, /^0x[0-9a-f]{40}$/, 'caller normalized to an EVM address');
    assert.match(tx.transferToAddress, /^0x[0-9a-f]{40}$/, 'created child normalized to an EVM address');
    assert.equal(typeof tx.valid, 'boolean', 'validity flag present');
  }
  assert.ok(
    normalized.some((tx) => tx.decodedNote === 'create'),
    `expected at least one decoded CREATE note; got ${JSON.stringify(normalized.map((t) => t.decodedNote))}`,
  );

  console.log(`✓ live-TRE conformance passed against ${base}`);
  console.log(
    `  runtime txid: ${built.nativeTransactionId} · deploy: ${String(info.receipt?.result)} · internal txns normalized: ${normalized.length}`,
  );
}

main().catch((error: unknown) => {
  console.error('CONFORMANCE FAILED:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
