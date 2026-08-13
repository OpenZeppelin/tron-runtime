# @openzeppelin/tron-runtime

Shared, **framework-neutral**, **stateless** native-TRON transport primitives —
address codecs, native transaction construction, canonical serialization +
transaction-id derivation, native-receipt note decoding, BigInt-safe JSON, and
transport-error classification. (Framework-neutral w.r.t. Foundry / Hardhat /
`upgrades-core`; it does depend on `tronweb` + `ethers`.)

Consumed by both the Foundry gateway (`openzeppelin-foundry-upgrades-tron`) and
`hardhat-tron`. It contains **mechanism only** — it never owns *policy*
(broadcast/retry, receipt-polling/finality, recovery) or classification of
internal transactions; each consumer keeps those, because Foundry waits for
solidified inclusion while `hardhat-tron` uses unconfirmed receipts and
recovery-mines on TRE.

> **Status: `0.1.0`** — pre-1.0 but stable: every export below is a settled
> contract covered by semver (breaking changes only with a version bump).
> Published to npm with build provenance. Requires Node **`>=22`**.

## Public API

Single entry point (deep imports into `dist/*` are unsupported):

```ts
import { toEvmAddress, jsonParseBigSafe } from '@openzeppelin/tron-runtime';
```

Each export carries TSDoc (parameters / return value / thrown errors) your editor surfaces on hover.

| Export | Purpose |
| --- | --- |
| `toEvmAddress(a)` · `toTronHexAddress(a)` · `toBase58Address(a)` | Address codecs — EVM `0x` (**lowercase**, canonical) / TRON `41…` / Base58 `T…`; consumers adapt casing (e.g. `ethers.getAddress(...)`). |
| `serializeSignedTransaction(tx)` | Serialize a signed transaction to hex; verify its embedded `txID`. |
| `nativeTxIdFromSignedBytes(bytes)` | Re-derive the txid from canonical signed bytes. |
| `jsonParseBigSafe(text)` | `JSON.parse` that preserves integers ≥ 2^53 in TVM responses. |
| `decodeInternalTransactionNote(note)` | Decode a raw internal-tx `note` to UTF-8 (`null` if absent/non-string) — the shared receipt primitive. |
| `buildCreate(tronWeb, opts, signer)` | Build **and sign** a `CreateSmartContract` (contract deploy). |
| `buildCall(tronWeb, opts, signer)` | Build **and sign** a `TriggerSmartContract` (contract call). |
| `signBuiltTransaction(tronWeb, tx, key)` | Sign a builder's output JSON and serialize it. |
| `retryableTransportError(error)` | Heuristic: is a transport/node error transient and retryable? |
| `normalizeAddress(a)` | Return all three address forms at once: `{ evm, tronHex, base58 }`. |
| `nativeContractAddress(txid, owner)` | Derive the address a native deploy creates. |

Types: `NormalizedAddress`, `BuiltTransaction`, `Signer`, `BuildCreateOptions`,
`BuildCallOptions`.

Receipt traces stay **raw** by design: the package decodes internal-transaction
notes (`decodeInternalTransactionNote`) and stops there — each consumer keeps its
own receipt wrapper and its own classification policy, so no full-trace
normalizer is exported.

## Design

**Mechanism, not policy.** The package holds no long-lived client, no
broadcast/poll loop, and no durable state; the caller injects the transport
(a `TronWeb` instance) and the signing key. Deciding *when* a transaction is
final, *how* to retry, *whether* to recover a mined-but-unconfirmed deploy, and
*what* an internal transaction means is left to each consumer. See
[`SECURITY.md`](./SECURITY.md) for the guarantees and boundaries.

## License

MIT
