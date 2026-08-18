import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// instructor_llm_config.api_key used to be written to the database exactly as submitted — plain
// text, readable to anyone with database access (a backup leak, a SQL injection limited to that
// one table, an over-shared read replica). This module is the fix: AES-256-GCM, keyed by a
// per-deployment secret (LLM_CONFIG_ENCRYPTION_KEY) that never lives in the database, the same
// "secret belongs in the environment, not a table" convention app/api/auth/register/route.ts
// already uses for INSTRUCTOR_SIGNUP_CODE.
//
// Both functions return null on any failure (missing/misconfigured key, corrupt ciphertext)
// rather than throwing — mirrors getSupabaseClient()'s null-on-missing-config pattern so callers
// can respond 500 the same way every other route does on missing config, instead of needing a
// try/catch around a crypto call.

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

function loadKey(): Buffer | null {
  const raw = process.env.LLM_CONFIG_ENCRYPTION_KEY;
  if (!raw) return null;
  const trimmed = raw.trim();
  // Rejects a leaked/placeholder default the same way isConfiguredInstructorCode does, even if
  // someone pastes a CHANGE-ME-style value directly into the env var.
  if (trimmed.length === 0 || trimmed.toUpperCase().startsWith("CHANGE-ME")) return null;

  let key: Buffer;
  try {
    key = Buffer.from(trimmed, "base64");
  } catch {
    return null;
  }
  // A wrong-length key would silently produce ciphertext no correctly-configured deployment
  // could ever decrypt — fail closed instead of guessing at padding/truncation.
  if (key.length !== KEY_BYTES) return null;
  return key;
}

/** iv:authTag:ciphertext, each base64 — a single string so the column can stay `text`. */
export function encryptSecret(plaintext: string): string | null {
  const key = loadKey();
  if (!key) return null;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(stored: string): string | null {
  const key = loadKey();
  if (!key) return null;

  const parts = stored.split(":");
  if (parts.length !== 3) return null;
  const [ivPart, authTagPart, ciphertextPart] = parts;

  try {
    const iv = Buffer.from(ivPart, "base64");
    const authTag = Buffer.from(authTagPart, "base64");
    const ciphertext = Buffer.from(ciphertextPart, "base64");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    // Wrong key, corrupt/tampered ciphertext, or a pre-encryption plaintext row (see
    // supabase/schema.sql's migration note) all land here — GCM's auth-tag check throws rather
    // than returning garbage, which is exactly the failure mode we want surfaced as "can't read
    // this," not silently misread.
    return null;
  }
}
