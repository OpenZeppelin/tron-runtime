import { toEvmAddress } from './address';

const HASH_PATTERN = /^(?:0x)?[0-9a-f]{64}$/i;
const HEX_PATTERN = /^(?:[0-9a-f]{2})+$/i;

// ── Internal helpers ──────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeHash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return `0x${value.replace(/^0x/i, '').toLowerCase()}`;
}

function decodeNote(note: string): string {
  // Tolerate an optional `0x` prefix: java-tron emits unprefixed hex, but a prefixed
  // form would otherwise pass through undecoded and hide a CREATE marker from consumers.
  const hex = note.replace(/^0x/i, '');
  return HEX_PATTERN.test(hex) ? Buffer.from(hex, 'hex').toString('utf8') : note;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Decode a native internal-transaction `note` to its UTF-8 string form (e.g. the
 * hex-encoded `create` marker → `"create"`). Returns `null` when the note is
 * absent or not a string, so a consumer can fail closed on a malformed note.
 *
 * This is the one receipt primitive genuinely shared by both consumers; it
 * classifies nothing — deciding "is this a CREATE attempt?" stays consumer policy.
 *
 * @param note - The raw `note` field from an `internal_transactions[]` entry.
 * @returns The decoded note, or `null` when absent/non-string.
 */
export function decodeInternalTransactionNote(note: unknown): string | null {
  return typeof note === 'string' ? decodeNote(note) : null;
}

/**
 * Canonical, classification-free view of one native internal transaction.
 * `rawNote`/`decodedNote` are `null` when the node's `note` is absent or not a
 * string — so a consumer can *classify* (e.g. "is this a CREATE?") and fail
 * closed on a malformed note. This module never decides what counts as a
 * CREATE attempt; that is consumer policy.
 */
export interface NormalizedInternalTransaction {
  hash: string;
  callerAddress: string;
  transferToAddress: string;
  /** Creation kind (e.g. `CREATE`/`CREATE2`) preserved verbatim when present, else `null`. */
  kind: string | null;
  rawNote: string | null;
  decodedNote: string | null;
  valid: boolean;
  callValueInfo: unknown[];
}

/**
 * Produce a canonical, classification-free view of one native internal transaction:
 * addresses normalized to EVM form, hash to `0x` + 32 bytes, the `rejected` marker
 * mapped to `valid`, and `kind`/`note` preserved verbatim (as `kind` and
 * `rawNote`/`decodedNote`) so the consumer decides what counts as a CREATE.
 *
 * @param transaction - One raw `internal_transactions[]` entry from a node receipt.
 * @returns The normalized internal transaction.
 * @throws If `transaction` is not an object, its hash/addresses are invalid, or a
 *   present `rejected` marker is not a boolean.
 */
export function normalizeInternalTransaction(transaction: unknown): NormalizedInternalTransaction {
  if (!isObject(transaction)) {
    throw new Error('Invalid native internal transaction');
  }
  const rejected = transaction.rejected;
  if (rejected !== undefined && typeof rejected !== 'boolean') {
    throw new Error('Invalid native internal transaction rejected marker');
  }
  const note = transaction.note;
  const rawNote = typeof note === 'string' ? note : null;
  return {
    hash: normalizeHash(transaction.hash, 'internal transaction hash'),
    callerAddress: toEvmAddress(transaction.caller_address as string),
    transferToAddress: toEvmAddress(transaction.transferTo_address as string),
    // Preserved verbatim so a consumer can reject unsupported CREATE2 without
    // re-reading the raw receipt. Normalization never interprets it.
    kind: typeof transaction.kind === 'string' ? transaction.kind : null,
    rawNote,
    decodedNote: rawNote === null ? null : decodeNote(rawNote),
    valid: rejected !== true,
    callValueInfo: Array.isArray(transaction.callValueInfo) ? structuredClone(transaction.callValueInfo) : [],
  };
}

/**
 * Normalize every native internal transaction in a receipt's trace — no filtering,
 * no classification, exactly one output per input, in order.
 *
 * @param internalTransactions - The raw `internal_transactions` array from a node receipt.
 * @returns The normalized entries, index-aligned with the input.
 * @throws If the input is not an array, or any entry fails {@link normalizeInternalTransaction}.
 */
export function normalizeInternalTransactions(internalTransactions: unknown): NormalizedInternalTransaction[] {
  if (!Array.isArray(internalTransactions)) {
    throw new Error('Native internal transaction list is required');
  }
  return internalTransactions.map(normalizeInternalTransaction);
}
