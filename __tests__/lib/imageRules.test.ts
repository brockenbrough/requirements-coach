import { describe, expect, it } from 'vitest';
import {
  AVATAR_MIME_EXTENSIONS,
  MAX_AVATAR_BYTES,
  MAX_COURSE_COVER_BYTES,
  avatarSizeError,
  courseCoverSizeError,
  sniffAvatarMime,
} from '../../lib/imageRules';

/** Pads a signature out to the 12 bytes sniffAvatarMime reads, so short-input handling is separate. */
function header(...bytes: number[]): Uint8Array {
  const head = new Uint8Array(12);
  head.set(bytes);
  return head;
}

const JPEG = header(0xff, 0xd8, 0xff, 0xe0);
const PNG = header(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = header(0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);

function textHeader(text: string): Uint8Array {
  return new TextEncoder().encode(text.padEnd(12, ' '));
}

describe('sniffAvatarMime', () => {
  it('recognises the three allowed formats', () => {
    expect(sniffAvatarMime(JPEG)).toBe('image/jpeg');
    expect(sniffAvatarMime(PNG)).toBe('image/png');
    expect(sniffAvatarMime(WEBP)).toBe('image/webp');
  });

  it('rejects SVG and HTML — the stored-XSS payloads (GitHub #278)', () => {
    expect(sniffAvatarMime(textHeader('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">'))).toBeNull();
    expect(sniffAvatarMime(textHeader('<!DOCTYPE html><script>alert(1)</script>'))).toBeNull();
  });

  it('rejects other binary formats not on the whitelist', () => {
    expect(sniffAvatarMime(header(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBeNull(); // GIF89a
    expect(sniffAvatarMime(header(0x25, 0x50, 0x44, 0x46))).toBeNull(); // %PDF
  });

  it('rejects a RIFF container that is not WebP', () => {
    const wav = header(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45);
    expect(sniffAvatarMime(wav)).toBeNull();
  });

  it('does not read past the end of a short header', () => {
    expect(sniffAvatarMime(new Uint8Array([]))).toBeNull();
    expect(sniffAvatarMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
    // RIFF present but truncated before the WEBP marker at offset 8.
    expect(sniffAvatarMime(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull();
  });
});

describe('avatarSizeError', () => {
  it('accepts sizes up to the limit', () => {
    expect(avatarSizeError(1)).toBeNull();
    expect(avatarSizeError(MAX_AVATAR_BYTES)).toBeNull();
  });

  it('rejects an empty file', () => {
    expect(avatarSizeError(0)).toBe('The image file is empty.');
  });

  it('rejects anything over the limit', () => {
    expect(avatarSizeError(MAX_AVATAR_BYTES + 1)).toBe('Image must be 2 MB or smaller.');
  });
});

describe('AVATAR_MIME_EXTENSIONS', () => {
  it('maps each allowed type to a distinct extension', () => {
    const extensions = Object.values(AVATAR_MIME_EXTENSIONS);
    expect(extensions).toEqual(['png', 'jpg', 'webp']);
    expect(new Set(extensions).size).toBe(extensions.length);
  });
});

describe('courseCoverSizeError', () => {
  it('accepts sizes up to the limit', () => {
    expect(courseCoverSizeError(1)).toBeNull();
    expect(courseCoverSizeError(MAX_COURSE_COVER_BYTES)).toBeNull();
  });

  it('rejects an empty file', () => {
    expect(courseCoverSizeError(0)).toBe('The image file is empty.');
  });

  it('rejects anything over the limit', () => {
    expect(courseCoverSizeError(MAX_COURSE_COVER_BYTES + 1)).toBe('Image must be 4 MB or smaller.');
  });

  it('has a higher limit than avatars, since a course cover is a wide banner, not a small circle', () => {
    expect(MAX_COURSE_COVER_BYTES).toBeGreaterThan(MAX_AVATAR_BYTES);
  });
});
