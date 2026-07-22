# Changelog

All notable changes to `@openzeppelin/tron-runtime` are documented here.

## [0.1.0-alpha.1]

Pre-1.0 prerelease, published to the public npm registry with build provenance
(SLSA) generated from GitHub Actions. Consumed as an ordinary semver registry
dependency (`@openzeppelin/tron-runtime@^0.1.0-alpha.1`); the published tarball
ships a prebuilt `dist/`.

Supersedes `v0.1.0-alpha.0` with the same public API surface; this entry
documents the registry publishing/consumption policy below.

### Public API surface

Single entry point — `import { ... } from '@openzeppelin/tron-runtime'` (deep
imports into `dist/*` are unsupported). The surface is machine-tracked in
`api-inventory.json` and enforced by `scripts/check-api-surface.ts`: 13
functions + 5 types, split **stable** / **provisional**. The release gate
refuses to ship a non-prerelease (stable) version while any provisional export
remains at the root.

**Stable (7 functions)** — settled contract:

- `toEvmAddress`, `toTronHexAddress`, `toBase58Address` — address codecs
- `serializeSignedTransaction`, `nativeTxIdFromSignedBytes` — canonical
  serialization and transaction-id derivation
- `jsonParseBigSafe` — BigInt-safe JSON parsing
- `decodeInternalTransactionNote` — shared receipt primitive

**Provisional (6 functions + all 5 types)** — may change, relocate, or be
removed before a stable `0.1.0`:

- `normalizeAddress`, `nativeContractAddress`
- `buildCreate`, `buildCall`, `signBuiltTransaction`, `retryableTransportError`
- Types: `NormalizedAddress`, `BuiltTransaction`, `Signer`,
  `BuildCreateOptions`, `BuildCallOptions`

See `README.md` for per-export descriptions and `SECURITY.md` for the
mechanism-only / no-policy boundary this package holds to.

### Packaging / consumption policy

- Published to the public npm registry and consumed as an ordinary semver
  dependency. The registry tarball ships a prebuilt `dist/` — `prepack` builds
  `dist/` before packing — so nothing is built during a consumer's install and
  no `prepare` hook is needed.
- Deep imports into `dist/*` remain **unsupported** — import only from the
  package root (`import { ... } from '@openzeppelin/tron-runtime'`). `dist/` is
  gitignored in this repo and produced only at pack time; directory-based
  `file:` installs and git-URL installs are unsupported because nothing builds
  `dist/` for them.
