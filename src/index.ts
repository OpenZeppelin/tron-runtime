// @openzeppelin/tron-runtime — shared stateless native-TRON transport primitives.
// Mechanism only: no long-lived client, no broadcast/poll loop, no policy.

export {
  normalizeAddress,
  toEvmAddress,
  toTronHexAddress,
  toBase58Address,
  nativeContractAddress,
} from './address';
export type { NormalizedAddress } from './address';

export { jsonParseBigSafe } from './json';

export { normalizeInternalTransaction, normalizeInternalTransactions } from './receipt';
export type { NormalizedInternalTransaction } from './receipt';

export {
  nativeTxIdFromSignedBytes,
  serializeSignedTransaction,
  signBuiltTransaction,
  buildCreate,
  buildCall,
  retryableTransportError,
} from './tx';
export type { BuiltTransaction, Signer, BuildCreateOptions, BuildCallOptions } from './tx';
