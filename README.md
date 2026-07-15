# @openzeppelin/tron-runtime

Shared, dependency-neutral **stateless** native-TRON transport primitives —
address codecs, native transaction construction, canonical serialization +
transaction-id derivation, native-receipt normalization, BigInt-safe JSON, and
transport-error classification.

Consumed by both the Foundry gateway (`openzeppelin-foundry-upgrades-tron`) and
`hardhat-tron`. It contains **mechanism only** — it never owns *policy*
(broadcast/retry, receipt-polling/finality, recovery) or classification of
internal transactions; each consumer keeps those, because Foundry waits for
solidified inclusion while `hardhat-tron` uses unconfirmed receipts and
recovery-mines on TRE.

> Status: pre-release (`0.1.0-alpha`), not yet published to npm.

## Public API

There is a single entry point — import the primitives you need:

```ts
import { buildCreate, toEvmAddress, nativeTxIdFromSignedBytes } from '@openzeppelin/tron-runtime';
```

Everything listed below is the **full supported surface**. Anything not listed
is an internal helper and may change without a breaking release. Each export
carries TSDoc (parameters, return value, and thrown errors) that your editor
surfaces on hover.

### Address codecs & derivation

| Export | Purpose |
| --- | --- |
| `toEvmAddress(address)` | Convert any accepted encoding to an EVM `0x`-address. |
| `toTronHexAddress(address)` | Convert to TRON hex form (`41…`, no `0x`). |
| `toBase58Address(address)` | Convert to checksum-valid Base58 (`T…`). |
| `normalizeAddress(address)` | Return all three forms at once: `{ evm, tronHex, base58 }`. |
| `nativeContractAddress(txid, owner)` | Derive the address a native deploy creates. |

### Native transactions

| Export | Purpose |
| --- | --- |
| `buildCreate(tronWeb, options, signer)` | Build + sign a `CreateSmartContract` (contract deploy). |
| `buildCall(tronWeb, options, signer)` | Build + sign a `TriggerSmartContract` (contract call). |
| `signBuiltTransaction(tronWeb, tx, key)` | Sign a builder's output JSON and serialize it. |
| `serializeSignedTransaction(tx)` | Serialize a signed transaction to hex; verify its `txID`. |
| `nativeTxIdFromSignedBytes(bytes)` | Re-derive the txid from canonical signed bytes. |
| `retryableTransportError(error)` | Heuristic: is a transport/node error transient and retryable? |

### Receipts & JSON

| Export | Purpose |
| --- | --- |
| `normalizeInternalTransactions(list)` | Normalize a receipt's internal-transaction trace (no filtering/classification). |
| `normalizeInternalTransaction(entry)` | Normalize a single internal transaction. |
| `jsonParseBigSafe(text)` | `JSON.parse` that preserves integers ≥ 2^53 in TVM responses. |

### Types

`NormalizedAddress`, `BuiltTransaction`, `Signer`, `BuildCreateOptions`,
`BuildCallOptions`, `NormalizedInternalTransaction`.

## Design

**Mechanism, not policy.** The package holds no long-lived client, no
broadcast/poll loop, and no durable state; the caller injects the transport
(a `TronWeb` instance) and the signing key. Deciding *when* a transaction is
final, *how* to retry, *whether* to recover a mined-but-unconfirmed deploy, and
*what* an internal transaction means is left to each consumer. See
[`SECURITY.md`](./SECURITY.md) for the guarantees and boundaries.

## License

MIT
