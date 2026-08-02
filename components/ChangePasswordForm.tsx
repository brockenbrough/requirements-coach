'use client';

import { useState } from 'react';
import { MIN_PASSWORD_LENGTH, passwordLengthError } from '../lib/passwordRules';
import { PasswordField } from './PasswordField';

/**
 * Inline "Change password" form for the profile page, matching the same reveal-in-card
 * pattern as the rest of the profile card (a single button flips a section open) instead of
 * a modal. Owns its own request: the old password is never handled anywhere but here and the
 * one POST it triggers — cleared from state the moment the request resolves either way, so it
 * never lingers longer than it has to.
 */
export function ChangePasswordForm({
  token,
  onCancel,
}: {
  token: string;
  onCancel: () => void;
}) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function clearFields() {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    const lengthError = passwordLengthError(newPassword);
    if (lengthError) return setError(lengthError);
    if (newPassword !== confirmPassword) return setError('New password and confirmation do not match.');

    setSubmitting(true);
    const res = await fetch('/api/profile/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    // Clear on both success and failure — a rejected old password is no reason to keep
    // any of the three values sitting in state.
    clearFields();

    if (!res.ok) {
      setError(data?.error || 'Failed to change password.');
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <div className="mt-3 rounded-xl border border-brand-teal/30 bg-brand-teal/10 p-4">
        <p className="text-sm font-bold text-brand-teal-dark">Password changed.</p>
        <p className="mt-1 text-sm text-gray-600">
          You&apos;re still signed in here. If you&apos;re logged in anywhere else, you&apos;ll need to sign in
          again there with your new password.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 transition hover:border-gray-300"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-5">
      <PasswordField
        label="Current Password"
        value={oldPassword}
        onChange={setOldPassword}
        placeholder="Your current password"
        autoComplete="current-password"
        variant="light"
      />
      <PasswordField
        label="New Password"
        value={newPassword}
        onChange={setNewPassword}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        autoComplete="new-password"
        variant="light"
      />
      <PasswordField
        label="Confirm New Password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="Repeat new password"
        autoComplete="new-password"
        variant="light"
      />

      {error ? <p className="text-sm font-semibold text-brand-danger">{error}</p> : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-brand-purple px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:opacity-70"
        >
          {submitting ? 'Changing…' : 'Change Password'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 transition hover:border-gray-300 disabled:opacity-70"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
