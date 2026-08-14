# Changelog

All notable changes to `@openzeppelin/tron-runtime` are documented here.

## [0.1.0]

First stable release. Same exports and behavior as `v0.1.0-alpha.1` — the only
change is that every export previously marked provisional is now stable, so the
full public API is covered by semver from here on.

### Public API

Import from the package root only. See `README.md` for per-export descriptions.

**Stable** — `toEvmAddress`, `toTronHexAddress`, `toBase58Address`,
`serializeSignedTransaction`, `nativeTxIdFromSignedBytes`, `jsonParseBigSafe`,
`decodeInternalTransactionNote`, `normalizeAddress`, `nativeContractAddress`,
`buildCreate`, `buildCall`, `signBuiltTransaction`, `retryableTransportError`,
and all types (`NormalizedAddress`, `BuiltTransaction`, `Signer`,
`BuildCreateOptions`, `BuildCallOptions`)

The formerly provisional exports were promoted after landing real consumers:
the Foundry plugin's RPC adapter imports all of them and they are exercised by
its live-TRE end-to-end suites.

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
