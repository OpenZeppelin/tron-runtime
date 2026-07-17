// @openzeppelin/tron-runtime — shared stateless native-TRON transport primitives.
// Mechanism only: no long-lived client, no broadcast/poll loop, no policy.
//
// Status: 0.1.0-alpha — pre-1.0, no adopted consumer yet. This barrel is the
// package's only entry point (package.json `exports` pins `.` → dist/index.js;
// deep imports into `dist/*` are unsupported). Exports are grouped by stability:
// the **provisional** group may change or be removed before a stable 0.1.0, and
// the RC release gate refuses to ship while any provisional export remains at the
// root. Not everything here is a settled contract yet.

// ── Stable — address codecs (lowercase EVM is canonical; consumers adapt casing) ──
export { toEvmAddress, toTronHexAddress, toBase58Address } from './address';

// ── Stable — canonical serialization / transaction id ──
export { serializeSignedTransaction, nativeTxIdFromSignedBytes } from './tx';

// ── Stable — BigInt-safe JSON ──
export { jsonParseBigSafe } from './json';

// ── Stable — neutral receipt note decoder (the shared receipt primitive) ──
export { decodeInternalTransactionNote } from './receipt';

// ── Provisional — may change/relocate/be removed before a stable 0.1.0 ──
export { normalizeAddress, nativeContractAddress } from './address';
export { buildCreate, buildCall, signBuiltTransaction, retryableTransportError } from './tx';

// ── Public types (each provisional alongside its function) ──
export type { NormalizedAddress } from './address';
export type { BuiltTransaction, Signer, BuildCreateOptions, BuildCallOptions } from './tx';
