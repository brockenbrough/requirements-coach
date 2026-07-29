'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AppShell } from '../../components/AppShell';

type Profile = { id: string; username: string; biography: string; avatar_url: string | null };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(false);
  const [biography, setBiography] = useState('');
  const [saving, setSaving] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newBiography, setNewBiography] = useState('');

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    setToken(stored);
    if (!stored) { setLoading(false); return; }
    fetchProfile(stored);
  }, []);

  async function fetchProfile(accessToken: string) {
    setLoading(true);
    const res = await fetch('/api/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || 'Failed to load profile.'); return; }
    setProfile(data.profile);
    if (data.profile) setBiography(data.profile.biography);
  }

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
    if (res.ok) { setProfile(data.profile); setBiography(data.profile.biography); }
    else setError(data.error || 'Failed to create profile.');
  }

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ biography }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) { setProfile(data.profile); setEditing(false); }
    else setError(data.error || 'Failed to save.');
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/profile/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    setUploading(false);
    if (res.ok) setProfile(data.profile);
    else setError(data.error || 'Failed to upload image.');
    event.target.value = '';
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
                    {profile.username[0].toUpperCase()}
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

            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Biography</p>
              {editing ? (
                <div className="mt-2 space-y-3">
                  <textarea
                    value={biography}
                    onChange={(e) => setBiography(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[#1B1642] outline-none transition focus:border-[#7C4DFF]"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="rounded-xl bg-[#7C4DFF] px-4 py-2 text-sm font-extrabold text-white hover:bg-[#6234d1] disabled:opacity-70"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditing(false); setBiography(profile.biography); }}
                      className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 hover:border-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-gray-600">{profile.biography || 'No biography yet.'}</p>
                  <button
                    onClick={() => setEditing(true)}
                    className="mt-3 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 hover:border-[#7C4DFF] hover:text-[#7C4DFF]"
                  >
                    Edit biography
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
