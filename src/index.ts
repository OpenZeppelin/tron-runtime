// @openzeppelin/tron-runtime — shared stateless native-TRON transport primitives.
// Mechanism only: no long-lived client, no broadcast/poll loop, no policy.
//
// Status: stable — every export below is a settled contract covered by semver
// (api-inventory.json tracks the surface; the check:api release gate refuses a
// stable version while any export is provisional). This barrel is the package's
// only entry point (package.json `exports` pins `.` → dist/index.js; deep
// imports into `dist/*` are unsupported).

// ── Address codecs (lowercase EVM is canonical; consumers adapt casing) ──
export { toEvmAddress, toTronHexAddress, toBase58Address } from './address';
export { normalizeAddress, nativeContractAddress } from './address';

// ── Canonical serialization / transaction id / native builders ──
export { serializeSignedTransaction, nativeTxIdFromSignedBytes } from './tx';
export { buildCreate, buildCall, signBuiltTransaction, retryableTransportError } from './tx';

// ── BigInt-safe JSON ──
export { jsonParseBigSafe } from './json';

// ── Neutral receipt note decoder (the shared receipt primitive) ──
export { decodeInternalTransactionNote } from './receipt';

// ── Public types ──
export type { NormalizedAddress } from './address';
export type { BuiltTransaction, Signer, BuildCreateOptions, BuildCallOptions } from './tx';
