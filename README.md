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

## License

MIT
