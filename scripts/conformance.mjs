#!/usr/bin/env node
// Live-TRE conformance for @openzeppelin/tron-runtime (Phase 1.5).
//
// Exercises the extracted primitives against a REAL java-tron node: build + sign
// through the injected TronWeb, broadcast the exact signed bytes, confirm the node
// computes the SAME txid, and normalize the real receipt's internal-tx trace.
//
// This gate is NON-SKIPPABLE: if a TRE endpoint is not reachable it EXITS 1.
// Pinned authority: tronbox/tre@sha256:e57deeb0d8201498549dbec28e7c329d8647ef0976b547cfbb6fa6a41a10f491
import assert from 'node:assert/strict';
import { TronWeb } from 'tronweb';

import rt from '../dist/index.js';
const { buildCreate, nativeTxIdFromSignedBytes, normalizeInternalTransactions } = rt;

const URL = process.env.TRON_RPC_URL;
// A funded TRE dev account (tronbox/tre default). Never used on a real network.
const KEY = process.env.TRON_PRIVATE_KEY ?? 'dd23ca549a97cb330b011aebb674730df8b14acaee42d211ab45692699ab8ba5';
const MINIMAL_CREATE = '0x6001600c60003960016000f300'; // returns a 1-byte STOP runtime

if (!URL) {
  console.error('CONFORMANCE FAILED: TRON_RPC_URL is not set. A live TRE is required — this gate does not skip.');
  process.exit(1);
}

const base = URL.replace(/\/$/, '');
async function request(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function main() {
  const tronWeb = new TronWeb({ fullHost: base, privateKey: KEY });
  const signer = { privateKey: KEY, feeLimit: 1_000_000_000 };

  // 1. build + sign through the runtime, against the real node's transaction builder
  const built = await buildCreate(tronWeb, { abi: [], bytecode: MINIMAL_CREATE, name: 'Conformance', callValue: 0 }, signer);

  // 2. our txid must re-derive from the signed bytes
  assert.equal(built.nativeTransactionId, nativeTxIdFromSignedBytes(built.signedNativeTransaction), 'txid re-derivation');

  // 3. the node must accept the EXACT signed bytes and report the SAME txid
  const broadcast = await request('/wallet/broadcasthex', { transaction: built.signedNativeTransaction });
  const dup = typeof broadcast.code === 'string' && /DUP_TRANSACTION/i.test(broadcast.code);
  assert.ok(broadcast.result === true || dup, `node rejected the signed bytes: ${JSON.stringify(broadcast)}`);
  if (broadcast.txid) assert.equal(broadcast.txid.toLowerCase(), built.nativeTransactionId, 'node txid == runtime txid');

  // 4. confirm + normalize the real receipt's internal-tx trace
  let info;
  for (let i = 0; i < 40; i += 1) {
    info = await request('/wallet/gettransactioninfobyid', { value: built.nativeTransactionId });
    if (info && info.id) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(info && info.id, 'no receipt returned by the node');
  assert.equal(info.id.toLowerCase(), built.nativeTransactionId, 'receipt id == runtime txid');
  const normalized = normalizeInternalTransactions(info.internal_transactions ?? []);
  assert.ok(Array.isArray(normalized), 'normalizeInternalTransactions returns an array');

  console.log(`✓ live-TRE conformance passed against ${base}`);
  console.log(`  runtime txid: ${built.nativeTransactionId}`);
  console.log(`  node result:  ${info.receipt?.result ?? '(pending)'} · internal txns normalized: ${normalized.length}`);
}

main().catch((error) => {
  console.error('CONFORMANCE FAILED:', error.message);
  process.exit(1);
});
