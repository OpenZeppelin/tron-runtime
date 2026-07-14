# Security policy

`@openzeppelin/tron-runtime` builds, signs, and serializes native TRON
transactions. Treat it as security-sensitive.

## Reporting

Report suspected vulnerabilities privately to **security@openzeppelin.com**.
Do not open public issues for security reports.

## Boundaries

- **Stateless mechanism only.** This package holds no long-lived client, no
  broadcast/poll loop, and no durable state. Callers inject the transport and
  the signing key; the package never reads environment variables, never stores
  a private key, and never persists anything to disk.
- **No policy.** Retry/rebroadcast budgets, receipt-polling/finality, recovery,
  and classification of internal transactions live in the consumers
  (`openzeppelin-foundry-upgrades-tron`, `hardhat-tron`), not here.
- **Deterministic core.** Address derivation, canonical serialization, and
  transaction-id derivation are pinned by deterministic test vectors and a
  live-TRE conformance suite against a fixed java-tron digest.
