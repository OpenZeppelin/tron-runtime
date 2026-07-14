// @openzeppelin/tron-runtime — shared stateless native-TRON transport primitives.
// Mechanism only: no long-lived client, no broadcast/poll loop, no policy.
//
// This barrel is the package's entire public API surface. Everything re-exported
// here is a supported entry point for consumers (the Foundry upgrades gateway and
// hardhat-tron); anything not re-exported is an internal helper and may change
// without a breaking release. The `exports` map in package.json pins the single
// public entry to `dist/index.js`, so deep imports into `dist/*` are not supported.

// ── Public API — address codecs & derivation ──
export {
  normalizeAddress,
  toEvmAddress,
  toTronHexAddress,
  toBase58Address,
  nativeContractAddress,
} from './address';

// ── Public API — native transaction build / sign / serialize / id ──
export {
  buildCreate,
  buildCall,
  signBuiltTransaction,
  serializeSignedTransaction,
  nativeTxIdFromSignedBytes,
  retryableTransportError,
} from './tx';

// ── Public API — native-receipt normalization ──
export { normalizeInternalTransaction, normalizeInternalTransactions } from './receipt';

// ── Public API — BigInt-safe JSON ──
export { jsonParseBigSafe } from './json';

// ── Public types ──
export type { NormalizedAddress } from './address';
export type { BuiltTransaction, Signer, BuildCreateOptions, BuildCallOptions } from './tx';
export type { NormalizedInternalTransaction } from './receipt';
