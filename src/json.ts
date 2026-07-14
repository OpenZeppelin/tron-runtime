// BigInt-safe JSON parsing for TVM responses.
//
// TVM transaction-info responses embed integers up to Long.MAX_VALUE
// (~9.22e18 sun) as raw JSON numbers. `JSON.parse` quantizes anything above
// 2^53 to the nearest IEEE-754 double (e.g. 999999999999999999 reads back as
// 1000000000000000000). We wrap every JSON integer token whose magnitude is
// >= 2^53 in quotes before parsing; downstream readers do `BigInt(value)`,
// which accepts both strings and numbers, so wrapping is non-breaking.
//
// Unlike the regex-based original (copied from hardhat-tron), this is a
// JSON-aware lexical pass: it never touches digits inside string literals, and
// it handles a bare root-level integer. Floats/exponents are left untouched
// (BigInt cannot represent them, matching the original's integer-only intent).

const SAFE_LIMIT = 9007199254740992n; // 2^53
const PRESCAN_RE = /\d{16,}/;
const INTEGER_TOKEN_RE = /^-?\d+$/;

// ── Internal helpers ──────────────────────────────────────────────────────────

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Parse JSON like `JSON.parse`, but preserve integer precision for TVM responses.
 *
 * TVM transaction-info responses embed integers up to `Long.MAX_VALUE`
 * (~9.22e18 sun) as raw JSON numbers, which `JSON.parse` quantizes to the nearest
 * IEEE-754 double (e.g. `999999999999999999` reads back as `1000000000000000000`).
 * This wraps every JSON *integer* token whose magnitude is >= 2^53 in quotes before
 * parsing, so downstream readers can do `BigInt(value)` losslessly — wrapping is
 * non-breaking because `BigInt` accepts both strings and numbers. Floats/exponents
 * are left untouched (BigInt cannot represent them).
 *
 * The rewrite is JSON-aware (it never touches digits inside string literals) and
 * fail-closed: the original text is validated with `JSON.parse` first, so invalid
 * JSON is rejected rather than silently "repaired".
 *
 * @param text - The JSON text to parse.
 * @returns The parsed value, with integers >= 2^53 rendered as decimal strings.
 * @throws {TypeError} If `text` is not a string.
 * @throws {SyntaxError} If `text` is not valid JSON.
 */
export function jsonParseBigSafe(text: string): unknown {
  if (typeof text !== 'string') {
    throw new TypeError('jsonParseBigSafe expects a string');
  }
  // Cheap short-circuit: no 16+ digit run means no integer can exceed 2^53.
  if (!PRESCAN_RE.test(text)) {
    return JSON.parse(text);
  }
  // Validate the ORIGINAL text first (result discarded — it is lossy on big ints).
  // Without this, the lexical rewrite could "repair" invalid JSON — e.g. quote a
  // leading-zero number or an unquoted numeric object key — turning a syntax error
  // into a silent success. JSON.parse rejects those here.
  JSON.parse(text);
  const n = text.length;
  let out = '';
  let i = 0;
  while (i < n) {
    const code = text.charCodeAt(i);

    // String literal: copy verbatim (including any digits), honoring escapes.
    if (code === 34 /* " */) {
      const start = i;
      i += 1;
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 92 /* \ */) {
          i += 2; // skip the escape and its escaped char
          continue;
        }
        i += 1;
        if (c === 34) break;
      }
      out += text.slice(start, i);
      continue;
    }

    // Number token (outside strings, only numbers begin with '-' or a digit).
    if (code === 45 /* - */ || isDigit(code)) {
      const start = i;
      if (code === 45) i += 1;
      while (i < n && isDigit(text.charCodeAt(i))) i += 1;
      let integer = true;
      if (i < n && text.charCodeAt(i) === 46 /* . */) {
        integer = false;
        i += 1;
        while (i < n && isDigit(text.charCodeAt(i))) i += 1;
      }
      const exp = i < n ? text.charCodeAt(i) : 0;
      if (exp === 101 || exp === 69 /* e | E */) {
        integer = false;
        i += 1;
        const sign = i < n ? text.charCodeAt(i) : 0;
        if (sign === 43 || sign === 45) i += 1;
        while (i < n && isDigit(text.charCodeAt(i))) i += 1;
      }
      const token = text.slice(start, i);
      if (integer && INTEGER_TOKEN_RE.test(token)) {
        const big = BigInt(token);
        const abs = big < 0n ? -big : big;
        out += abs >= SAFE_LIMIT ? `"${token}"` : token;
      } else {
        out += token;
      }
      continue;
    }

    out += text.charAt(i);
    i += 1;
  }
  return JSON.parse(out);
}
