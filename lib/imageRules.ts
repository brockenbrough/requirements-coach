// Avatar upload rules (GitHub #278). The `avatars` bucket is public, so whatever lands in it is
// served straight back from the Supabase domain — an .svg or .html carrying a <script> would be
// stored XSS. Two consequences shape this module:
//
//   1. The *sniffed* magic bytes are the only source of truth. `File.name` and `File.type` are
//      client input and are never read by the upload route: the storage key's extension and the
//      upload's contentType both come from `sniffAvatarMime` instead.
//   2. There is a hard byte cap, since the bucket is billed storage anyone with an account can
//      write to.
//
// Shared between the route and the profile form so client and server can't drift on what "valid"
// means, the same way lib/passwordRules.ts anchors the password rule.

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
