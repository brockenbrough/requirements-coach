'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { ChangePasswordForm } from '../../components/ChangePasswordForm';
import { EditableField } from '../../components/EditableField';
import { ImageCropModal } from '../../components/ImageCropModal';
import { MyCoursesSection } from '../../components/MyCoursesSection';
import { useUser } from '../../components/UserProvider';
import { getInitials } from '../../lib/initials';

type ProfileDraft = {
  first_name: string;
  last_name: string;

  age: string;
  semester: string;
  biography: string;
};

/**
 * Same gear glyph as the sidebar Settings icon-button in AppShell.tsx, so
 * "this icon means edit/configure" reads consistently across the app.
 */
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.3.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2.1 1.2l-2.3-.9-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.3-.9c.6.5 1.3.9 2.1 1.2L10 21h4l.5-2.5a7 7 0 0 0 2.1-1.2l2.3.9 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { token, profile, loading, setProfile } = useUser();
  const [error, setError] = useState('');

  // Role is known from profile once it exists; before that (create flow) it lives in the
  // JWT user_metadata set at registration time — decoded here so instructors never see
  // the Semester field even on their very first profile-creation visit.
  function getRoleFromToken(t: string): string | null {
    try {
      return (JSON.parse(atob(t.split('.')[1])) as { user_metadata?: { role?: string } }).user_metadata?.role ?? null;
    } catch {
      return null;
    }
  }
  const isInstructor = profile?.role === 'instructor' || getRoleFromToken(token ?? '') === 'instructor';

  // No session, and we're done checking: send the user to a real "logged out"
  // screen instead of leaving the profile page mounted with nothing to show.
  useEffect(() => {
    if (!loading && !token) router.replace('/login');
  }, [loading, token, router]);

  const [creating, setCreating] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newSemester, setNewSemester] = useState('');
  const [newBiography, setNewBiography] = useState('');

  // One editing flag for the whole card (instead of one per field): clicking the single
  // "Edit Profile" button flips every field into an input at once, and draft holds every
  // field's in-progress value until Save or Cancel resolves it.
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Shared by profile creation and handleSaveAll below — both need the same age/semester validation. */
  function parseOptionalNumber(raw: string, min: number, max: number): { value: number | null; error?: string } {
    const trimmed = raw.trim();
    if (trimmed === '') return { value: null };
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < min || n > max) {
      return { value: null, error: `Please enter a whole number between ${min} and ${max}.` };
    }
    return { value: n };
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;

    const age = parseOptionalNumber(newAge, 1, 129);
    if (age.error) return setError(age.error);
    const semester = parseOptionalNumber(newSemester, 1, 20);
    if (semester.error) return setError(semester.error);

    setError('');
    setCreating(true);
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        username: newUsername,
        first_name: newFirstName,
        last_name: newLastName,
        age: age.value,
        semester: semester.value,
        biography: newBiography,
      }),
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

  function draftFromProfile(p: { first_name: string; last_name: string; age: number | null; semester: number | null; biography: string }): ProfileDraft {
    return {
      first_name: p.first_name,
      last_name: p.last_name,
      age: p.age != null ? String(p.age) : '',
      semester: p.semester != null ? String(p.semester) : '',
      biography: p.biography,
    };
  }

  function startEditing() {
    if (!profile) return;
    setDraft(draftFromProfile(profile));
    setError('');
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setDraft(null);
    setError('');
  }

  function updateDraft<K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  /**
   * Saves every changed field in one PATCH instead of one request per field — only fields
   * whose draft value actually differs from the stored profile are sent.
   */
  async function handleSaveAll() {
    if (!token || !profile || !draft) return;

    const age = parseOptionalNumber(draft.age, 1, 129);
    if (age.error) return setError(age.error);
    const semester = parseOptionalNumber(draft.semester, 1, 20);
    if (semester.error) return setError(semester.error);

    const trimmedFirst = draft.first_name.trim();
    const trimmedLast = draft.last_name.trim();

    const updates: Record<string, unknown> = {};
    if (trimmedFirst !== (profile.first_name ?? '')) updates.first_name = trimmedFirst;
    if (trimmedLast !== (profile.last_name ?? '')) updates.last_name = trimmedLast;
    if (age.value !== profile.age) updates.age = age.value;
    if (semester.value !== profile.semester) updates.semester = semester.value;
    if (draft.biography !== profile.biography) updates.biography = draft.biography;

    if (Object.keys(updates).length === 0) {
      cancelEditing();
      return;
    }

    setError('');
    setSavingProfile(true);
    const err = await patchProfile(updates);
    setSavingProfile(false);
    if (err) {
      setError(err);
      return;
    }
    setIsEditing(false);
    setDraft(null);
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
                First name
                <input
                  type="text"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-brand-navy outline-none transition focus:border-brand-purple"
                  placeholder="Enter your first name"
                />
              </label>
              <label className="block text-sm font-bold text-gray-600">
                Last name
                <input
                  type="text"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-brand-navy outline-none transition focus:border-brand-purple"
                  placeholder="Enter your last name"
                />
              </label>
              <div className={isInstructor ? undefined : 'grid grid-cols-2 gap-4'}>
                <label className="block text-sm font-bold text-gray-600">
                  Age
                  <input
                    type="number"
                    value={newAge}
                    onChange={(e) => setNewAge(e.target.value)}
                    min={1}
                    max={129}
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-brand-navy outline-none transition focus:border-brand-purple"
                    placeholder="Age in years"
                  />
                </label>
                {!isInstructor && (
                  <label className="block text-sm font-bold text-gray-600">
                    Semester
                    <input
                      type="number"
                      value={newSemester}
                      onChange={(e) => setNewSemester(e.target.value)}
                      min={1}
                      max={20}
                      className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-brand-navy outline-none transition focus:border-brand-purple"
                      placeholder="Enter your current semester"
                    />
                  </label>
                )}
              </div>
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

            {!isEditing ? (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={startEditing}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-extrabold text-gray-600 transition hover:border-brand-purple hover:text-brand-purple"
                >
                  <GearIcon />
                  Edit Profile
                </button>
              </div>
            ) : null}

            <EditableField
              label="First name"
              editing={isEditing}
              value={isEditing ? (draft?.first_name ?? '') : (profile.first_name ?? '')}
              onChange={(v) => updateDraft('first_name', v)}
              placeholder="Enter your first name"
            />
            <EditableField
              label="Last name"
              editing={isEditing}
              value={isEditing ? (draft?.last_name ?? '') : (profile.last_name ?? '')}
              onChange={(v) => updateDraft('last_name', v)}
              placeholder="Enter your last name"
            />
            <EditableField
              label="Age"
              editing={isEditing}
              value={isEditing ? (draft?.age ?? '') : (profile.age != null ? String(profile.age) : '')}
              onChange={(v) => updateDraft('age', v)}
              inputType="number"
              min={1}
              max={129}
              placeholder="Age in years"
            />
            {!isInstructor && (
              <EditableField
                label="Semester"
                editing={isEditing}
                value={isEditing ? (draft?.semester ?? '') : (profile.semester != null ? String(profile.semester) : '')}
                onChange={(v) => updateDraft('semester', v)}
                inputType="number"
                min={1}
                max={20}
                placeholder="Enter your current semester"
              />
            )}
            <EditableField
              label="Biography"
              editing={isEditing}
              value={isEditing ? (draft?.biography ?? '') : profile.biography}
              onChange={(v) => updateDraft('biography', v)}
              emptyText="No biography yet."
              inputType="textarea"
              placeholder="Tell us about yourself…"
            />

            {isEditing ? (
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={savingProfile}
                  className="rounded-xl bg-brand-purple px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:opacity-70"
                >
                  {savingProfile ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={savingProfile}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 transition hover:border-gray-300 disabled:opacity-70"
                >
                  Cancel
                </button>
              </div>
            ) : null}

            <div className="mt-8 border-t border-gray-100 pt-6">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Change Password</p>

              {showPasswordForm ? (
                <ChangePasswordForm token={token} onCancel={() => setShowPasswordForm(false)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPasswordForm(true)}
                  className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-extrabold text-gray-600 transition hover:border-brand-purple hover:text-brand-purple"
                >
                  <LockIcon />
                  Change Password
                </button>
              )}
            </div>

            {/* GitHub #242 (UI-2): a course concept only exists for students right now — an
                instructor manages courses from /instructor/courses instead, so this doesn't
                apply to their profile. */}
            {!isInstructor ? <MyCoursesSection token={token} /> : null}
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
