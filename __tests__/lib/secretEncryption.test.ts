import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encryptSecret, decryptSecret } from '../../lib/secretEncryption';

// A real 32-byte key, base64-encoded, matching the format LLM_CONFIG_ENCRYPTION_KEY documents in
// .env.example (`openssl rand -base64 32`).
const VALID_KEY = Buffer.alloc(32, 7).toString('base64');

// Saved and restored around every test — same pattern __tests__/api/auth.test.ts uses for
// INSTRUCTOR_SIGNUP_CODE — so one test's value can never leak into the next.
const ORIGINAL_KEY = process.env.LLM_CONFIG_ENCRYPTION_KEY;

describe('secretEncryption', () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.LLM_CONFIG_ENCRYPTION_KEY;
    else process.env.LLM_CONFIG_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  describe('with a configured key', () => {
    beforeEach(() => {
      process.env.LLM_CONFIG_ENCRYPTION_KEY = VALID_KEY;
    });

    it('round-trips a plaintext string through encrypt then decrypt', () => {
      const ciphertext = encryptSecret('sk-super-secret-key');
      expect(ciphertext).not.toBeNull();
      expect(ciphertext).not.toContain('sk-super-secret-key');
      expect(decryptSecret(ciphertext!)).toBe('sk-super-secret-key');
    });

    it('produces a different ciphertext for the same plaintext on repeated calls (random IV)', () => {
      const first = encryptSecret('sk-same-key');
      const second = encryptSecret('sk-same-key');
      expect(first).not.toBe(second);
      expect(decryptSecret(first!)).toBe('sk-same-key');
      expect(decryptSecret(second!)).toBe('sk-same-key');
    });

    it('returns null when decrypting a tampered ciphertext instead of throwing', () => {
      const ciphertext = encryptSecret('sk-super-secret-key')!;
      const tampered = ciphertext.slice(0, -4) + 'abcd';
      expect(decryptSecret(tampered)).toBeNull();
    });

    it('returns null when decrypting a value that predates encryption (plain string, no delimiters)', () => {
      expect(decryptSecret('sk-plaintext-legacy-value')).toBeNull();
    });

    it('returns null when decrypting under a different key than it was encrypted with', () => {
      const ciphertext = encryptSecret('sk-super-secret-key')!;
      process.env.LLM_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
      expect(decryptSecret(ciphertext)).toBeNull();
    });
  });

  describe('without a configured key', () => {
    it('encryptSecret returns null when LLM_CONFIG_ENCRYPTION_KEY is unset', () => {
      delete process.env.LLM_CONFIG_ENCRYPTION_KEY;
      expect(encryptSecret('sk-super-secret-key')).toBeNull();
    });

    it('decryptSecret returns null when LLM_CONFIG_ENCRYPTION_KEY is unset', () => {
      delete process.env.LLM_CONFIG_ENCRYPTION_KEY;
      expect(decryptSecret('anything')).toBeNull();
    });

    it('rejects a CHANGE-ME-style placeholder the same way INSTRUCTOR_SIGNUP_CODE does', () => {
      process.env.LLM_CONFIG_ENCRYPTION_KEY = 'CHANGE-ME-please-set-a-real-key';
      expect(encryptSecret('sk-super-secret-key')).toBeNull();
    });

    it('rejects a key that does not decode to exactly 32 bytes', () => {
      process.env.LLM_CONFIG_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');
      expect(encryptSecret('sk-super-secret-key')).toBeNull();
    });
  });
});
