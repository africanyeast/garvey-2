import { createHash } from "node:crypto";
import { ulid, decodeTime } from "ulid";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function newId(): string {
  return ulid();
}

export function isUlid(id: string): boolean {
  return ULID_RE.test(id);
}

/** Any id a thing file can be named by — ULIDs, plus the old slug-like
 * project ids (`untitled-2-2`) that notes still point at. */
export function isValidId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id) && id.length <= 200;
}

/** Creation time encoded in a ULID, or null for a non-ULID id. */
export function ulidTime(id: string): number | null {
  if (!isUlid(id)) return null;
  try {
    return decodeTime(id);
  } catch {
    return null;
  }
}

/** A ULID whose random part is derived from `seed`, so the migration mints
 * the same id for the same source every run. */
export function deterministicUlid(timeMs: number, seed: string): string {
  let t = Math.max(0, Math.floor(timeMs));
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const hash = createHash("sha256").update(seed).digest();
  // 80 bits = 16 base32 chars, 5 bits each, read from the first 10 bytes.
  let rand = "";
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < 10; i++) {
    buffer = (buffer << 8) | hash[i];
    bits += 8;
    while (bits >= 5) {
      rand += CROCKFORD[(buffer >> (bits - 5)) & 31];
      bits -= 5;
      buffer &= (1 << bits) - 1;
    }
  }
  return time + rand;
}
