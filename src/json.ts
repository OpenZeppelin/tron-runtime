// BigInt-safe JSON parsing for TVM responses.
//
// TVM transaction-info responses embed integers up to Long.MAX_VALUE
// (~9.22e18 sun) as raw JSON numbers. `JSON.parse` quantizes anything above
// 2^53 to the nearest IEEE-754 double, so e.g. 999999999999999999 reads back
// as 1000000000000000000. We wrap every integer >= 2^53 in quotes (making it a
// JSON string) before parsing; downstream readers do `BigInt(value)`, which
// accepts both strings and numbers, so wrapping is non-breaking.
//
// Hot-path note: the rewrite regex is expensive on long bodies, and most
// responses contain no integers above 2^53. A cheap pre-scan short-circuits it.

const LARGE_INT_RE = /(:|,|\[)\s*(-?\d{16,})(?=\s*[,\]}])/g;
const PRESCAN_RE = /\d{16,}/;
const SAFE_LIMIT = 9007199254740992n; // 2^53

export function jsonParseBigSafe(text: string): unknown {
  if (!PRESCAN_RE.test(text)) {
    return JSON.parse(text);
  }
  const rewritten = text.replace(LARGE_INT_RE, (_match, before: string, digits: string) => {
    let n: bigint;
    try {
      n = BigInt(digits);
    } catch {
      return `${before}${digits}`;
    }
    const abs = n < 0n ? -n : n;
    return abs >= SAFE_LIMIT ? `${before}"${digits}"` : `${before}${digits}`;
  });
  return JSON.parse(rewritten);
}
