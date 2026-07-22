# Changelog

All notable changes to `@openzeppelin/tron-runtime` are documented here.

## [0.1.0-alpha.1]

Supersedes `v0.1.0-alpha.0` — same public API, no functional changes.

### Public API

Import from the package root only. See `README.md` for per-export descriptions.

**Stable** — `toEvmAddress`, `toTronHexAddress`, `toBase58Address`,
`serializeSignedTransaction`, `nativeTxIdFromSignedBytes`, `jsonParseBigSafe`,
`decodeInternalTransactionNote`

**Provisional** (may change before `0.1.0`) — `normalizeAddress`,
`nativeContractAddress`, `buildCreate`, `buildCall`, `signBuiltTransaction`,
`retryableTransportError`, and all types (`NormalizedAddress`,
`BuiltTransaction`, `Signer`, `BuildCreateOptions`, `BuildCallOptions`)
