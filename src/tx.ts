import { createHash } from 'node:crypto';
import { TronWeb, utils } from 'tronweb';

import { toTronHexAddress } from './address';

const TXID_PATTERN = /^(?:0x)?[0-9a-f]{64}$/i;
const HEX_BYTES_PATTERN = /^(?:0x)?(?:[0-9a-f]{2})+$/i;

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

/** Native transaction id = sha256(rawData) of a canonically-encoded signed tx. */
export function nativeTxIdFromSignedBytes(signedNativeTransaction: string): string {
  const { rawData } = parseCanonicalSignedTransaction(signedNativeTransaction);
  return createHash('sha256').update(rawData).digest('hex');
}

// --- signing / serialization (stateless; tronweb utils, no node) ---

interface TronUtils {
  transaction: { txJsonToPb(tx: unknown): { addSignature(sig: Uint8Array): void; serializeBinary(): number[] } };
  code: { hexStr2byteArray(hex: string): number[] };
  bytes: { byteArray2hexStr(bytes: number[]): string };
}

/** Serialize a signed transaction JSON to hex and assert its embedded txID matches. */
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

export interface BuiltTransaction {
  signedNativeTransaction: string;
  nativeTransactionId: string;
  transaction: unknown;
}

export interface Signer {
  privateKey: string;
  feeLimit: number;
}

export interface BuildCreateOptions {
  abi: unknown[];
  bytecode: string;
  constructorData?: string;
  ownerAddress?: string;
  name?: string;
  callValue?: number | string | bigint;
}

export interface BuildCallOptions {
  contractAddress: string;
  data?: string;
  ownerAddress?: string;
  callValue?: number | string | bigint;
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

function ownerHex(tronWeb: InjectedTronWeb, ownerAddress?: string): string {
  const address = ownerAddress ?? (tronWeb.defaultAddress?.hex || undefined);
  if (typeof address !== 'string') throw new Error('No owner address available');
  return toTronHexAddress(address);
}

/** Sign a built transaction JSON with the injected key and serialize it. */
export async function signBuiltTransaction(
  tronWeb: TronWeb,
  transaction: unknown,
  privateKey: string,
): Promise<BuiltTransaction> {
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

/** Build + sign a CreateSmartContract transaction (hits the node via the injected TronWeb). */
export async function buildCreate(tronWeb: TronWeb, options: BuildCreateOptions, signer: Signer): Promise<BuiltTransaction> {
  if (!Array.isArray(options.abi)) throw new Error('Invalid contract ABI');
  const tw = tronWeb as unknown as InjectedTronWeb;
  const transaction = await tw.transactionBuilder.createSmartContract(
    {
      abi: options.abi,
      bytecode: stripHex(options.bytecode, 'contract bytecode', false),
      callValue: normalizeCallValue(options.callValue ?? 0),
      feeLimit: signer.feeLimit,
      name: options.name ?? '',
      rawParameter: stripHex(options.constructorData ?? '', 'constructor data'),
    },
    ownerHex(tw, options.ownerAddress),
  );
  return signBuiltTransaction(tronWeb, transaction, signer.privateKey);
}

/** Build + sign a TriggerSmartContract transaction (hits the node via the injected TronWeb). */
export async function buildCall(tronWeb: TronWeb, options: BuildCallOptions, signer: Signer): Promise<BuiltTransaction> {
  const tw = tronWeb as unknown as InjectedTronWeb;
  const wrapper = await tw.transactionBuilder.triggerSmartContract(
    toTronHexAddress(options.contractAddress),
    '',
    {
      callValue: normalizeCallValue(options.callValue ?? 0),
      feeLimit: signer.feeLimit,
      input: stripHex(options.data ?? '', 'call data'),
      txLocal: true,
    },
    [],
    ownerHex(tw, options.ownerAddress),
  );
  if (wrapper?.result?.result !== true) {
    const message = wrapper?.result?.message ? `: ${wrapper.result.message}` : '';
    throw new Error(`Native call prebuild failed${message}`);
  }
  return signBuiltTransaction(tronWeb, wrapper.transaction, signer.privateKey);
}

// --- transport-error classification (pure) ---

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

/** Classify whether a transport/node error is worth retrying. Walks `.cause` with a cycle guard. */
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
