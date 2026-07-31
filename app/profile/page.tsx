'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { EditableField } from '../../components/EditableField';
import { ImageCropModal } from '../../components/ImageCropModal';
import { useUser } from '../../components/UserProvider';
import { getInitials } from '../../lib/initials';

export default function ProfilePage() {
  const { token, profile, loading, setProfile } = useUser();
  const [error, setError] = useState('');

  const [creating, setCreating] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newBiography, setNewBiography] = useState('');

  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setCreating(true);
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: newUsername, biography: newBiography }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) setProfile(data.profile);
    else setError(data.error || 'Failed to create profile.');
  }

  /** Shared PATCH for every editable field (biography, first/last name, age, semester). */
  async function patchProfile(fields: Record<string, unknown>): Promise<string | null> {
    if (!token) return 'Not logged in.';
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(fields),
    });
    const data = await res.json();
    if (!res.ok) return data.error || 'Failed to save.';
    setProfile(data.profile);
    return null;
  }

  function saveOptionalNumber(field: 'age' | 'semester', min: number, max: number) {
    return async (raw: string): Promise<string | null> => {
      const trimmed = raw.trim();
      if (trimmed === '') return patchProfile({ [field]: null });
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < min || n > max) {
        return `Please enter a whole number between ${min} and ${max}.`;
      }
      return patchProfile({ [field]: n });
    };
  }

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPendingImage(URL.createObjectURL(file));
  }

  function handleCropCancel() {
    if (pendingImage) URL.revokeObjectURL(pendingImage);
    setPendingImage(null);
  }

  async function handleCropSave(croppedBlob: Blob) {
    if (!token) return;
    setUploading(true);
    setError('');
    const formData = new FormData();
    formData.append('image', new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' }));
    const res = await fetch('/api/profile/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    setUploading(false);
    if (res.ok) setProfile(data.profile);
    else setError(data.error || 'Failed to upload image.');
    if (pendingImage) URL.revokeObjectURL(pendingImage);
    setPendingImage(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0e0b1e] text-[#F3F1FF]">
        <p className="text-[#A79FC9]">Loading…</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0e0b1e] px-6 text-[#F3F1FF]">
        <section className="space-y-4 text-center">
          <p className="text-[#A79FC9]">You must be logged in to view your profile.</p>
          <Link href="/login" className="inline-block rounded-full bg-[#7C4DFF] px-4 py-2 text-sm font-bold text-white hover:bg-[#6234d1]">
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  return (
    <>
      <AppShell active="profile">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-gray-100 bg-gray-50 p-8">
        <p className="text-sm font-extrabold uppercase tracking-wide text-[#7C4DFF]">Profile</p>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>
        ) : null}

        {profile === null ? (
          <>
            <h1 className="mt-4 text-3xl font-extrabold text-[#1B1642]">Create your profile</h1>
            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <label className="block text-sm font-bold text-gray-600">
                Username
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[#1B1642] outline-none transition focus:border-[#7C4DFF]"
                  placeholder="your_username"
                />
              </label>
              <label className="block text-sm font-bold text-gray-600">
                Biography
                <textarea
                  value={newBiography}
                  onChange={(e) => setNewBiography(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[#1B1642] outline-none transition focus:border-[#7C4DFF]"
                  placeholder="Tell us about yourself…"
                />
              </label>
              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-xl bg-[#7C4DFF] px-4 py-3 font-extrabold text-white transition hover:bg-[#6234d1] disabled:opacity-70"
              >
                {creating ? 'Creating…' : 'Create profile'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="group relative h-24 w-24 overflow-hidden rounded-full border-2 border-gray-200 bg-white transition hover:border-[#7C4DFF] disabled:opacity-70"
                title="Change profile photo"
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl font-extrabold text-gray-400">
                    {getInitials(profile.first_name, profile.last_name, profile.username)}
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs text-white opacity-0 transition group-hover:opacity-100">
                  {uploading ? 'Uploading…' : 'Change photo'}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <h1 className="text-3xl font-extrabold text-[#1B1642]">{profile.username}</h1>
            </div>

            <EditableField
              label="First name"
              value={profile.first_name ?? ''}
              placeholder="Anna"
              onSave={(v) => patchProfile({ first_name: v })}
            />
            <EditableField
              label="Last name"
              value={profile.last_name ?? ''}
              placeholder="Student"
              onSave={(v) => patchProfile({ last_name: v })}
            />
            <EditableField
              label="Age"
              value={profile.age != null ? String(profile.age) : ''}
              inputType="number"
              min={1}
              max={129}
              placeholder="21"
              onSave={saveOptionalNumber('age', 1, 129)}
            />
            <EditableField
              label="Semester"
              value={profile.semester != null ? String(profile.semester) : ''}
              inputType="number"
              min={1}
              max={20}
              placeholder="4"
              onSave={saveOptionalNumber('semester', 1, 20)}
            />
            <EditableField
              label="Biography"
              value={profile.biography}
              emptyText="No biography yet."
              inputType="textarea"
              placeholder="Tell us about yourself…"
              onSave={(v) => patchProfile({ biography: v })}
            />
          </>
        )}
      </section>
      </AppShell>
      {pendingImage ? (
        <ImageCropModal key={pendingImage} imageSrc={pendingImage} onCancel={handleCropCancel} onSave={handleCropSave} />
      ) : null}
    </>
  );
}
