const HEX_PATTERN = /^(?:[0-9a-f]{2})+$/i;

// ── Internal helpers ──────────────────────────────────────────────────────────

function decodeNote(note: string): string {
  // Tolerate an optional `0x` prefix: java-tron emits unprefixed hex, but a prefixed
  // form would otherwise pass through undecoded and hide a CREATE marker from consumers.
  const hex = note.replace(/^0x/i, '');
  return HEX_PATTERN.test(hex) ? Buffer.from(hex, 'hex').toString('utf8') : note;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Decode a native internal-transaction `note` to its UTF-8 string form (e.g. the
 * hex-encoded `create` marker → `"create"`). Returns `null` when the note is
 * absent or not a string, so a consumer can fail closed on a malformed note.
 *
 * This is the one receipt primitive genuinely shared by both consumers; it
 * classifies nothing — deciding "is this a CREATE attempt?" stays consumer policy.
 *
 * @param note - The raw `note` field from an `internal_transactions[]` entry.
 * @returns The decoded note, or `null` when absent/non-string.
 */
export function decodeInternalTransactionNote(note: unknown): string | null {
  return typeof note === 'string' ? decodeNote(note) : null;
}
