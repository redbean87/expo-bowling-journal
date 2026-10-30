/**
 * The id source for the journal's local primary keys.
 *
 * `crypto.randomUUID()` is the preferred source, but it is not part of the
 * JS runtime every target ships: the Hermes engine an Expo Android build runs
 * has a `crypto` object with no `randomUUID` member, and the local import path
 * mints an id for every entity it writes — so a source that only exists in
 * Node or the browser fails on the device before a single row is written. The
 * sources are tried in this order, first one present wins:
 *
 * 1. `crypto.randomUUID()` — browsers, Node, and the web build.
 * 2. `crypto.getRandomValues()` — assembled into a canonical v4 UUID, which is
 *    what a device's Hermes runtime provides.
 * 3. `Math.random()` — a last resort that still emits a canonical v4 UUID. It
 *    is not cryptographically strong, and these ids are local primary keys
 *    only (never a secret, token, or capability), so uniqueness inside one
 *    journal is all that is required.
 *
 * Every path returns the canonical 8-4-4-4-12 v4 form, which is what the
 * journal's `Uuid` primary keys and the PinPal import's id mapping compare
 * against.
 */
import type { Uuid } from './types';

/** One byte as two hex digits. */
function hexByte(byte: number): string {
  return (byte & 0xff).toString(16).padStart(2, '0');
}

/** Hex digits `start` through `end` (exclusive) of a sixteen-byte block. */
function hexGroup(bytes: Uint8Array, start: number, end: number): string {
  let digits = '';

  for (let index = start; index < end; index += 1) {
    digits += hexByte(bytes[index]);
  }

  return digits;
}

/**
 * Sixteen bytes, assembled into a canonical v4 UUID.
 *
 * The version bits (byte 6, high nibble `4`) and the variant bits (byte 8,
 * high nibble `8`) are set here, so the id is a v4 whatever the bytes came
 * from — a CSPRNG or the last resort.
 */
function canonicalV4FromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return [
    hexGroup(bytes, 0, 4),
    hexGroup(bytes, 4, 6),
    hexGroup(bytes, 6, 8),
    hexGroup(bytes, 8, 10),
    hexGroup(bytes, 10, 16),
  ].join('-');
}

/** Sixteen unpredictable-enough bytes for a local primary key. */
function bytesFromMathRandom(): Uint8Array {
  const bytes = new Uint8Array(16);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 0x100);
  }

  return bytes;
}

/**
 * A fresh local primary key, from the strongest source this runtime has.
 *
 * Prefers `crypto.randomUUID()`, then `crypto.getRandomValues()` assembled
 * into a v4, then a `Math.random()` v4. The last of those is not
 * cryptographically strong and is used only for local journal keys, never for
 * anything security-sensitive.
 */
export function newLocalUuid(): Uuid {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  const bytes =
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
      ? crypto.getRandomValues(new Uint8Array(16))
      : bytesFromMathRandom();

  return canonicalV4FromBytes(bytes);
}
