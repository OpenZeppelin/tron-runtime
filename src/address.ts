import { TronWeb } from 'tronweb';
import { concat, dataSlice, keccak256 } from 'ethers';

const EVM_HEX_PATTERN = /^(?:0x)?[0-9a-f]{40}$/i;
const TRON_HEX_PATTERN = /^(?:0x)?41[0-9a-f]{40}$/i;
const NATIVE_TXID_PATTERN = /^[0-9a-f]{64}$/i;

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

/** TRON hex form without the `0x` prefix (e.g. `41…`). */
export function toTronHexAddress(address: string): string {
  return tronHexFromAddress(address);
}

/** EVM `0x`-prefixed 20-byte form (drops the TRON `41` prefix). */
export function toEvmAddress(address: string): string {
  return `0x${tronHexFromAddress(address).slice(2)}`;
}

/** Checksum-valid Base58 (`T…`) form. */
export function toBase58Address(address: string): string {
  const base58 = TronWeb.address.fromHex(tronHexFromAddress(address));
  if (!TronWeb.isAddress(base58)) {
    throw invalidAddress();
  }
  return base58;
}

export interface NormalizedAddress {
  evm: string;
  tronHex: string;
  base58: string;
}

/** Normalize any accepted encoding into all three canonical forms. */
export function normalizeAddress(address: string): NormalizedAddress {
  const tronHex = tronHexFromAddress(address);
  return {
    evm: `0x${tronHex.slice(2)}`,
    tronHex,
    base58: toBase58Address(tronHex),
  };
}

/**
 * Native TVM contract-address derivation: `keccak256(txid ‖ 0x41‖owner)[12:]`.
 * Returned as a lowercase EVM `0x`-address. Pure derivation — no node calls.
 */
export function nativeContractAddress(nativeTransactionId: string, ownerAddress: string): string {
  const txid = typeof nativeTransactionId === 'string' ? nativeTransactionId.replace(/^0x/i, '') : '';
  if (!NATIVE_TXID_PATTERN.test(txid)) {
    throw new Error('Invalid native transaction ID');
  }
  const owner = toEvmAddress(ownerAddress).slice(2);
  return dataSlice(keccak256(concat([`0x${txid}`, `0x41${owner}`])), 12).toLowerCase();
}
