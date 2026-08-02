// No password rule existed anywhere in the app before this (register only marks the field
// `required`). Shared between the change-password route and form so client and server can't
// drift on what "valid" means, the same way lib/sessionRules.ts anchors the session constants.
export const MIN_PASSWORD_LENGTH = 8;

export function passwordLengthError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }
  return null;
}
