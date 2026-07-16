import { createHash } from 'node:crypto';
import { TronWeb, utils } from 'tronweb';

import { toTronHexAddress } from './address';

const TXID_PATTERN = /^(?:0x)?[0-9a-f]{64}$/i;
const HEX_BYTES_PATTERN = /^(?:0x)?(?:[0-9a-f]{2})+$/i;

// ── Internal helpers ──────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTxId(value: unknown): string {
  if (typeof value !== 'string' || !TXID_PATTERN.test(value)) throw new Error('Invalid native transaction ID');
  return value.replace(/^0x/i, '').toLowerCase();
}

function normalizeSignedBytes(value: unknown): string {
  if (typeof value !== 'string' || !HEX_BYTES_PATTERN.test(value)) {
    throw new Error('Invalid signed native transaction bytes');
  }
  return value.replace(/^0x/i, '').toLowerCase();
}

function stripHex(value: unknown, label: string, allowEmpty = true): string {
  if (typeof value !== 'string' || !/^(?:0x)?(?:[0-9a-f]{2})*$/i.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  const normalized = value.replace(/^0x/i, '').toLowerCase();
  if (!allowEmpty && normalized.length === 0) throw new Error(`Invalid ${label}`);
  return normalized;
}

function normalizeCallValue(value: unknown): number {
  let parsed: bigint;
  if (typeof value === 'bigint') parsed = value;
  else if (typeof value === 'string' && /^[0-9]+$/.test(value)) parsed = BigInt(value);
  else if (typeof value === 'number' && Number.isSafeInteger(value)) parsed = BigInt(value);
  else throw new Error('Invalid call value');
  if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid call value');
  return Number(parsed);
}

// --- canonical protobuf/varint parsing (self-contained, deterministic) ---

function encodeVarint(value: number | bigint): Buffer {
  let remaining = BigInt(value);
  const encoded: number[] = [];
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) byte |= 0x80;
    encoded.push(byte);
  } while (remaining !== 0n);
  return Buffer.from(encoded);
}

function readCanonicalVarint(bytes: Buffer, offset: number, label: string): { value: number; offset: number } {
  let value = 0n;
  let shift = 0n;
  for (let index = offset; index < bytes.length && index < offset + 10; index += 1) {
    const byte = bytes[index]!;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(`Malformed signed native transaction protobuf ${label}`);
      }
      const encoded = encodeVarint(value);
      const consumed = bytes.subarray(offset, index + 1);
      if (!consumed.equals(encoded)) {
        throw new Error(`Noncanonical signed native transaction protobuf ${label}`);
      }
      return { value: Number(value), offset: index + 1 };
    }
    shift += 7n;
  }
  throw new Error(`Overlong signed native transaction protobuf ${label}`);
}

function parseCanonicalSignedTransaction(signedNativeTransaction: string): { rawData: Buffer; signatureCount: number } {
  const bytes = Buffer.from(normalizeSignedBytes(signedNativeTransaction), 'hex');
  let offset = 0;
  let rawData: Buffer | undefined;
  let signatureCount = 0;
  const canonicalFields: Buffer[] = [];
  while (offset < bytes.length) {
    const tag = readCanonicalVarint(bytes, offset, 'tag');
    offset = tag.offset;
    if (tag.value !== 0x0a && tag.value !== 0x12) {
      throw new Error('Unsupported signed native transaction protobuf field');
    }
    if (tag.value === 0x0a && (rawData !== undefined || signatureCount !== 0)) {
      throw new Error('Duplicate or out-of-order signed native transaction raw_data');
    }
    if (tag.value === 0x12 && rawData === undefined) {
      throw new Error('Signed native transaction signature precedes raw_data');
    }
    const length = readCanonicalVarint(bytes, offset, 'length');
    offset = length.offset;
    const end = offset + length.value;
    if (end > bytes.length) throw new Error('Malformed signed native transaction protobuf');
    const payload = bytes.subarray(offset, end);
    if (tag.value === 0x0a) {
      if (payload.length === 0) throw new Error('Signed native transaction has empty raw_data');
      rawData = bytes.subarray(offset, end);
    } else {
      if (payload.length !== 65) throw new Error('Signed native transaction signature must be 65 bytes');
      signatureCount += 1;
    }
    canonicalFields.push(Buffer.from([tag.value]), encodeVarint(payload.length), payload);
    offset = end;
  }
  if (rawData === undefined || rawData.length === 0) throw new Error('Signed native transaction is missing raw_data');
  if (signatureCount === 0) throw new Error('Signed native transaction is missing a signature');
  if (!Buffer.concat(canonicalFields).equals(bytes)) {
    throw new Error('Noncanonical signed native transaction protobuf wrapper');
  }
  return { rawData, signatureCount };
}

// Minimal structural view of tronweb's signing utilities (its shipped types
// under-describe the pieces we use).
interface TronUtils {
  transaction: { txJsonToPb(tx: unknown): { addSignature(sig: Uint8Array): void; serializeBinary(): number[] } };
  code: { hexStr2byteArray(hex: string): number[] };
  bytes: { byteArray2hexStr(bytes: number[]): string };
}

// Minimal structural view of the injected TronWeb (its shipped types under-describe
// transactionBuilder/trx for our use). Callers pass a real TronWeb instance.
interface InjectedTronWeb {
  defaultAddress?: { hex?: string | false };
  trx: { sign(transaction: unknown, privateKey: string): Promise<unknown> };
  transactionBuilder: {
    createSmartContract(options: unknown, owner: string): Promise<unknown>;
    triggerSmartContract(
      contractAddress: string,
      functionSelector: string,
      options: unknown,
      parameters: unknown[],
      owner: string,
    ): Promise<{ result?: { result?: boolean; message?: string }; transaction?: unknown }>;
  };
}

const PRIVATE_KEY_PATTERN = /^[0-9a-f]{64}$/i;

function assertPrivateKey(privateKey: unknown): string {
  if (typeof privateKey !== 'string' || !PRIVATE_KEY_PATTERN.test(privateKey)) {
    throw new Error('Invalid signer private key');
  }
  return privateKey;
}

// The origin validated the signer (64-hex key + positive safe-integer feeLimit) in its
// constructor before any build/sign. Replicate that fail-closed check here.
function assertSigner(signer: unknown): Signer {
  if (
    !isObject(signer) ||
    typeof signer.privateKey !== 'string' ||
    !PRIVATE_KEY_PATTERN.test(signer.privateKey) ||
    !Number.isSafeInteger(signer.feeLimit) ||
    (signer.feeLimit as number) <= 0
  ) {
    throw new Error('Invalid signer');
  }
  return signer as unknown as Signer;
}

// The origin methods defaulted a missing options argument to `{}` then issued domain
// errors; preserve that instead of a raw TypeError on a missing options object.
function requireOptions<T>(options: unknown): T {
  return (isObject(options) ? options : {}) as T;
}

function ownerHex(tronWeb: InjectedTronWeb, ownerAddress?: string): string {
  const address = ownerAddress ?? (tronWeb.defaultAddress?.hex || undefined);
  if (typeof address !== 'string') throw new Error('No owner address available');
  return toTronHexAddress(address);
}

// ── Public API — types ──────────────────────────────────────────────────────────

/** A built, signed transaction plus the bytes and id a consumer broadcasts/tracks. */
export interface BuiltTransaction {
  /** Signed transaction as lowercase hex (no `0x`) — broadcast these exact bytes. */
  signedNativeTransaction: string;
  /** The 64-char hex native transaction id derived from `signedNativeTransaction`. */
  nativeTransactionId: string;
  /** The signed transaction JSON as returned by TronWeb (opaque to consumers). */
  transaction: unknown;
}

/** Signing material a build/sign call needs. Never stored, logged, or persisted by this package. */
export interface Signer {
  /** 64-hex-char private key (no `0x`). */
  privateKey: string;
  /** Positive fee limit, in sun, applied to the built transaction. */
  feeLimit: number;
}

/** Options for {@link buildCreate} (a native `CreateSmartContract` deploy). */
export interface BuildCreateOptions {
  /** Contract ABI (required; may be empty for a bytecode-only deploy). */
  abi: unknown[];
  /** Creation bytecode as hex (optional `0x`). */
  bytecode: string;
  /** ABI-encoded constructor arguments as hex (optional `0x`); defaults to empty. */
  constructorData?: string;
  /** Deployer address in any accepted encoding; defaults to the injected TronWeb's default address. */
  ownerAddress?: string;
  /** Optional contract name recorded on-chain. */
  name?: string;
  /** Value in sun sent with creation; defaults to 0. */
  callValue?: number | string | bigint;
}

/** Options for {@link buildCall} (a native `TriggerSmartContract` call). */
export interface BuildCallOptions {
  /** Target contract address in any accepted encoding. */
  contractAddress: string;
  /** ABI-encoded calldata as hex (optional `0x`); defaults to empty. */
  data?: string;
  /** Caller address in any accepted encoding; defaults to the injected TronWeb's default address. */
  ownerAddress?: string;
  /** Value in sun sent with the call; defaults to 0. */
  callValue?: number | string | bigint;
}

// ── Public API — canonical id derivation ──────────────────────────────────────

/**
 * Re-derive a transaction's native id from its signed bytes: `sha256(raw_data)`
 * of the canonically-encoded signed transaction.
 *
 * The bytes are parsed with a strict canonical protobuf/varint reader that rejects
 * noncanonical, overlong, duplicate, or out-of-order encodings, so the id cannot be
 * altered by re-encoding equivalent bytes.
 *
 * @param signedNativeTransaction - The signed transaction as hex (optional `0x`).
 * @returns The 64-char lowercase hex transaction id (no `0x`).
 * @throws If the input is not valid hex or not a canonical signed transaction.
 */
export function nativeTxIdFromSignedBytes(signedNativeTransaction: string): string {
  const { rawData } = parseCanonicalSignedTransaction(signedNativeTransaction);
  return createHash('sha256').update(rawData).digest('hex');
}

// ── Public API — signing / serialization (stateless; tronweb utils, no node) ──

/**
 * Serialize a signed transaction JSON (as returned by TronWeb signing) to the hex
 * bytes a node accepts, and assert the transaction's embedded `txID` equals the id
 * re-derived from those bytes — so a mismatched or tampered `txID` fails closed.
 *
 * @param transaction - A signed transaction JSON with a non-empty `signature` array and a `txID`.
 * @returns The lowercase hex serialization (no `0x`).
 * @throws If the transaction is unsigned/malformed, or its `txID` disagrees with the serialized bytes.
 */
export function serializeSignedTransaction(transaction: unknown): string {
  if (!isObject(transaction) || !Array.isArray(transaction.signature) || transaction.signature.length === 0) {
    throw new Error('Native transaction is not signed');
  }
  const u = utils as unknown as TronUtils;
  const protobuf = u.transaction.txJsonToPb(transaction);
  for (const signature of transaction.signature) {
    const normalized = stripHex(signature, 'native transaction signature', false);
    protobuf.addSignature(Uint8Array.from(u.code.hexStr2byteArray(normalized)));
  }
  const serialized = u.bytes.byteArray2hexStr(protobuf.serializeBinary()).toLowerCase();
  if (normalizeTxId((transaction as { txID?: unknown }).txID) !== nativeTxIdFromSignedBytes(serialized)) {
    throw new Error('Native transaction ID mismatch');
  }
  return serialized;
}

/**
 * Sign a transaction builder's output JSON with the given key (via the injected
 * TronWeb) and serialize it into broadcastable bytes.
 *
 * Stateless: uses only the injected TronWeb's signing/serialization utilities and
 * makes no node calls of its own.
 *
 * @param tronWeb - A TronWeb instance providing signing utilities.
 * @param transaction - The unsigned transaction JSON returned by a builder.
 * @param privateKey - 64-hex-char signing key (no `0x`).
 * @returns The signed bytes, derived id, and signed transaction JSON — see {@link BuiltTransaction}.
 * @throws If the key is malformed, the transaction is missing, or the `txID` fails verification.
 */
export async function signBuiltTransaction(
  tronWeb: TronWeb,
  transaction: unknown,
  privateKey: string,
): Promise<BuiltTransaction> {
  assertPrivateKey(privateKey);
  if (!isObject(transaction)) throw new Error('Native transaction builder returned no transaction');
  const tw = tronWeb as unknown as InjectedTronWeb;
  const signed = await tw.trx.sign(transaction, privateKey);
  const signedNativeTransaction = serializeSignedTransaction(signed);
  return {
    signedNativeTransaction,
    nativeTransactionId: nativeTxIdFromSignedBytes(signedNativeTransaction),
    transaction: signed,
  };
}

/**
 * Build and sign a native `CreateSmartContract` (contract deploy) transaction.
 *
 * Uses the injected TronWeb's transaction builder, which contacts the node to
 * prebuild the transaction, then signs it locally.
 *
 * @param tronWeb - A TronWeb instance bound to the target node.
 * @param options - Deploy inputs — see {@link BuildCreateOptions}.
 * @param signer - Signing key + fee limit — see {@link Signer}.
 * @returns The signed, broadcastable transaction — see {@link BuiltTransaction}.
 * @throws If the signer or options are invalid, or the node fails to prebuild the transaction.
 */
export async function buildCreate(tronWeb: TronWeb, options: BuildCreateOptions, signer: Signer): Promise<BuiltTransaction> {
  const { privateKey, feeLimit } = assertSigner(signer);
  const opts = requireOptions<BuildCreateOptions>(options);
  if (!Array.isArray(opts.abi)) throw new Error('Invalid contract ABI');
  const tw = tronWeb as unknown as InjectedTronWeb;
  const transaction = await tw.transactionBuilder.createSmartContract(
    {
      abi: opts.abi,
      bytecode: stripHex(opts.bytecode, 'contract bytecode', false),
      // `=== undefined` (not `??`) so an explicit `null` fails closed, as the origin did.
      callValue: normalizeCallValue(opts.callValue === undefined ? 0 : opts.callValue),
      feeLimit,
      name: opts.name === undefined ? '' : opts.name,
      rawParameter: stripHex(opts.constructorData === undefined ? '' : opts.constructorData, 'constructor data'),
    },
    ownerHex(tw, opts.ownerAddress),
  );
  return signBuiltTransaction(tronWeb, transaction, privateKey);
}

/**
 * Build and sign a native `TriggerSmartContract` (contract call) transaction.
 *
 * Uses the injected TronWeb's transaction builder with `txLocal: true`, so the
 * transaction is constructed **locally** and only its returned wrapper shape is
 * checked — there is **no node execution / pre-validation** of the call (TronWeb
 * may still fetch reference-block params, so it is not fully offline). Then signs
 * it locally.
 *
 * @param tronWeb - A TronWeb instance bound to the target node.
 * @param options - Call inputs — see {@link BuildCallOptions}.
 * @param signer - Signing key + fee limit — see {@link Signer}.
 * @returns The signed, broadcastable transaction — see {@link BuiltTransaction}.
 * @throws If the signer or options are invalid, or the local prebuild returns an unusable wrapper.
 */
export async function buildCall(tronWeb: TronWeb, options: BuildCallOptions, signer: Signer): Promise<BuiltTransaction> {
  const { privateKey, feeLimit } = assertSigner(signer);
  const opts = requireOptions<BuildCallOptions>(options);
  const tw = tronWeb as unknown as InjectedTronWeb;
  const wrapper = await tw.transactionBuilder.triggerSmartContract(
    toTronHexAddress(opts.contractAddress),
    '',
    {
      callValue: normalizeCallValue(opts.callValue === undefined ? 0 : opts.callValue),
      feeLimit,
      input: stripHex(opts.data === undefined ? '' : opts.data, 'call data'),
      txLocal: true,
    },
    [],
    ownerHex(tw, opts.ownerAddress),
  );
  // isObject excludes arrays/functions/null — the origin's wrapper-shape guard.
  if (!isObject(wrapper)) throw new Error('Native call prebuild failed');
  const result = (wrapper as { result?: { result?: boolean; message?: string } }).result;
  if (result?.result !== true) {
    throw new Error(`Native call prebuild failed${result?.message ? `: ${result.message}` : ''}`);
  }
  return signBuiltTransaction(tronWeb, (wrapper as { transaction?: unknown }).transaction, privateKey);
}

// ── Internal helpers — transport-error classification ──────────────────────────

const RETRYABLE_NETWORK_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function numericHttpStatus(error: Record<string, unknown>): number | undefined {
  const candidates = [error.status, error.statusCode, (error.response as Record<string, unknown> | undefined)?.status, error.code];
  for (const candidate of candidates) {
    if (Number.isInteger(candidate)) return candidate as number;
    if (typeof candidate === 'string' && /^[0-9]{3}$/.test(candidate)) return Number(candidate);
  }
  return undefined;
}

// ── Public API — transport-error classification (pure) ──────────────────────────

/**
 * Classify whether a transport/node error is transient and worth retrying, rather
 * than a definitive failure. Retryable HTTP statuses (408, 429, 5xx), known
 * transient network error codes, and timeout/socket/network messages count as
 * retryable; the error's `.cause` chain is walked with a cycle guard.
 *
 * A pure heuristic — it decides nothing about retry budgets or backoff; that
 * policy stays with the consumer.
 *
 * @param error - Any thrown or rejected value from a transport or node call.
 * @returns `true` if the error looks transient and retryable, otherwise `false`.
 */
export function retryableTransportError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while ((typeof current === 'object' && current !== null) || typeof current === 'function') {
    if (seen.has(current)) return false;
    seen.add(current);
    const record = current as Record<string, unknown>;
    const status = numericHttpStatus(record);
    if (status !== undefined) return status === 408 || status === 429 || (status >= 500 && status <= 599);
    if (typeof record.code === 'string' && RETRYABLE_NETWORK_CODES.has(record.code.toUpperCase())) return true;
    const message = typeof record.message === 'string' ? record.message : '';
    if (/network|socket|reset|timed?\s*out|timeout|offline|outage|fetch failed/i.test(message)) return true;
    current = record.cause;
  }
  return false;
}
