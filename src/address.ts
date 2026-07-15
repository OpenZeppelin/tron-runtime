import { TronWeb } from 'tronweb';
import { concat, dataSlice, keccak256 } from 'ethers';

const EVM_HEX_PATTERN = /^(?:0x)?[0-9a-f]{40}$/i;
const TRON_HEX_PATTERN = /^(?:0x)?41[0-9a-f]{40}$/i;
const NATIVE_TXID_PATTERN = /^[0-9a-f]{64}$/i;

// ── Internal helpers ──────────────────────────────────────────────────────────

function invalidAddress(): Error {
  return new Error('Invalid TRON address');
}

function tronHexFromAddress(address: string): string {
  if (typeof address !== 'string' || address.length === 0) {
    throw invalidAddress();
  }
  if (TRON_HEX_PATTERN.test(address)) {
    return address.replace(/^0x/i, '').toLowerCase();
  }
  if (EVM_HEX_PATTERN.test(address)) {
    return `41${address.replace(/^0x/i, '').toLowerCase()}`;
  }
  if (TronWeb.isAddress(address)) {
    const tronHex = TronWeb.address.toHex(address).toLowerCase();
    if (TRON_HEX_PATTERN.test(tronHex)) {
      return tronHex;
    }
  }
  throw invalidAddress();
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Convert any accepted address encoding to TRON hex form **without** the `0x`
 * prefix (i.e. the `41`-prefixed 21-byte hex, e.g. `41…`).
 *
 * @param address - An EVM (`0x…` or bare 40-hex), TRON hex (`41…`), or Base58 (`T…`) address.
 * @returns The lowercase `41`-prefixed hex address (no `0x`).
 * @throws If `address` is not a recognizable TRON address.
 */
export function toTronHexAddress(address: string): string {
  return tronHexFromAddress(address);
}

/**
 * Convert any accepted address encoding to its EVM `0x`-prefixed 20-byte form,
 * dropping the TRON `41` prefix.
 *
 * @param address - An EVM (`0x…` or bare 40-hex), TRON hex (`41…`), or Base58 (`T…`) address.
 * @returns The lowercase `0x`-prefixed 20-byte address.
 * @throws If `address` is not a recognizable TRON address.
 */
export function toEvmAddress(address: string): string {
  return `0x${tronHexFromAddress(address).slice(2)}`;
}

/**
 * Convert any accepted address encoding to checksum-valid Base58 (`T…`) form.
 *
 * @param address - An EVM (`0x…` or bare 40-hex), TRON hex (`41…`), or Base58 (`T…`) address.
 * @returns The Base58Check `T…` address.
 * @throws If `address` is not a recognizable TRON address.
 */
export function toBase58Address(address: string): string {
  const base58 = TronWeb.address.fromHex(tronHexFromAddress(address));
  if (!TronWeb.isAddress(base58)) {
    throw invalidAddress();
  }
  return base58;
}

/** One address rendered in all three canonical encodings. */
export interface NormalizedAddress {
  /** EVM `0x`-prefixed 20-byte form. */
  evm: string;
  /** TRON hex form (`41…`, no `0x`). */
  tronHex: string;
  /** Base58Check `T…` form. */
  base58: string;
}

/**
 * Normalize any accepted address encoding into all three canonical forms at once.
 *
 * @param address - An EVM (`0x…` or bare 40-hex), TRON hex (`41…`), or Base58 (`T…`) address.
 * @returns The address as `{ evm, tronHex, base58 }`.
 * @throws If `address` is not a recognizable TRON address.
 */
export function normalizeAddress(address: string): NormalizedAddress {
  const tronHex = tronHexFromAddress(address);
  return {
    evm: `0x${tronHex.slice(2)}`,
    tronHex,
    base58: toBase58Address(tronHex),
  };
}

/**
 * Derive the address a native TVM `CreateSmartContract` deploys to, per
 * `keccak256(txid ‖ 0x41 ‖ owner)[12:]`. Pure derivation — makes no node calls.
 *
 * @param nativeTransactionId - The creating transaction's 32-byte id (64 hex chars, optional `0x`).
 * @param ownerAddress - The deployer address, in any accepted encoding.
 * @returns The lowercase EVM `0x`-address of the contract that would be created.
 * @throws If the transaction id is not 32 bytes of hex, or `ownerAddress` is invalid.
 */
export function nativeContractAddress(nativeTransactionId: string, ownerAddress: string): string {
  const txid = typeof nativeTransactionId === 'string' ? nativeTransactionId.replace(/^0x/i, '') : '';
  if (!NATIVE_TXID_PATTERN.test(txid)) {
    throw new Error('Invalid native transaction ID');
  }
  const owner = toEvmAddress(ownerAddress).slice(2);
  return dataSlice(keccak256(concat([`0x${txid}`, `0x41${owner}`])), 12).toLowerCase();
}
