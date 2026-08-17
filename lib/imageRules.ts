// Image upload rules — originally just avatars (GitHub #278), now also backing course covers
// (GitHub #363 follow-up, POST /api/instructor/course-covers). Both public buckets serve
// whatever lands in them straight back from the Supabase domain — an .svg or .html carrying a
// <script> would be stored XSS. Two consequences shape this module:
//
//   1. The *sniffed* magic bytes are the only source of truth. `File.name` and `File.type` are
//      client input and are never read by either upload route: the storage key's extension and
//      the upload's contentType both come from `sniffAvatarMime` instead.
//   2. There is a hard byte cap per use case, since both buckets are billed storage anyone with
//      an account (avatars) or instructor role (course covers) can write to.
//
// Shared between the routes and their forms so client and server can't drift on what "valid"
// means, the same way lib/passwordRules.ts anchors the password rule. The format whitelist/sniff
// function is genuinely shared (nothing about magic-byte sniffing is avatar-specific) — only the
// size cap differs per use case, so course-cover code should import sniffAvatarMime/
// AVATAR_MIME_EXTENSIONS/AVATAR_HEADER_BYTES directly rather than duplicating them.

export type AvatarMime = 'image/png' | 'image/jpeg' | 'image/webp';

/** Whitelist *and* extension source — the storage key is built from this, never from the filename. */
export const AVATAR_MIME_EXTENSIONS: Record<AvatarMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_AVATAR_MB = MAX_AVATAR_BYTES / (1024 * 1024);

/** For the file picker's `accept` attribute — a UI hint only; the route is what enforces this. */
export const AVATAR_ACCEPT_ATTRIBUTE = 'image/png,image/jpeg,image/webp';

export const AVATAR_TYPE_ERROR = 'Only PNG, JPEG or WebP images are allowed.';

/** Bytes of the file header `sniffAvatarMime` needs (WebP's marker sits at offset 8). */
export const AVATAR_HEADER_BYTES = 12;

export function avatarSizeError(size: number): string | null {
  if (size <= 0) return 'The image file is empty.';
  if (size > MAX_AVATAR_BYTES) return `Image must be ${MAX_AVATAR_MB} MB or smaller.`;
  return null;
}

// Course covers are a wide banner, not a small circle — a bit more headroom than an avatar, but
// still a hard cap for the same billed-storage reason.
export const MAX_COURSE_COVER_BYTES = 4 * 1024 * 1024;
const MAX_COURSE_COVER_MB = MAX_COURSE_COVER_BYTES / (1024 * 1024);

/** Same format whitelist as avatars — no separate accept attribute/error copy needed. */
export const COURSE_COVER_ACCEPT_ATTRIBUTE = AVATAR_ACCEPT_ATTRIBUTE;
export const COURSE_COVER_TYPE_ERROR = AVATAR_TYPE_ERROR;

export function courseCoverSizeError(size: number): string | null {
  if (size <= 0) return 'The image file is empty.';
  if (size > MAX_COURSE_COVER_BYTES) return `Image must be ${MAX_COURSE_COVER_MB} MB or smaller.`;
  return null;
}

function startsWith(head: Uint8Array, signature: number[], offset = 0): boolean {
  if (head.length < offset + signature.length) return false;
  return signature.every((byte, i) => head[offset + i] === byte);
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP", at offset 8 inside a RIFF container

/**
 * Identifies the image format from its first `AVATAR_HEADER_BYTES` bytes, or null for anything not
 * on the whitelist — including SVG and HTML, which are text and therefore match no signature.
 */
export function sniffAvatarMime(head: Uint8Array): AvatarMime | null {
  if (startsWith(head, JPEG)) return 'image/jpeg';
  if (startsWith(head, PNG)) return 'image/png';
  if (startsWith(head, RIFF) && startsWith(head, WEBP, 8)) return 'image/webp';
  return null;
}
