'use client';

import { useRef, useState } from 'react';
import { uploadCourseCover } from '../lib/courseClient';
import { COURSE_COVERS } from '../lib/courseCovers';
import { AVATAR_MIME_EXTENSIONS, COURSE_COVER_ACCEPT_ATTRIBUTE, COURSE_COVER_TYPE_ERROR, courseCoverSizeError } from '../lib/imageRules';

/**
 * Shared by CreateCourseModal and EditCourseModal (GitHub #363 follow-up) — pick one of the 3
 * default covers, revert to the deterministic auto-pick, or upload a custom image from the
 * instructor's own device. Owns its own upload request/loading/error state; the result is
 * reported to the parent only as the resolved `coverImageUrl` string (or null for "auto") through
 * onChange, the same shape lib/courseCovers.ts's resolveCourseCoverSrc/course.coverImageUrl
 * already use — the parent form just carries that value through create/update like any other
 * field, with no upload-specific state of its own.
 *
 * "Custom upload" is detected structurally (value is non-null and isn't one of the 3 defaults'
 * own static path) rather than via a separate boolean prop — the column itself doesn't
 * distinguish an explicit default pick from an upload (see the schema's own comment), so neither
 * does this component.
 */
export function CourseCoverPicker({
  token,
  value,
  onChange,
}: {
  token: string;
  value: string | null;
  onChange: (coverImageUrl: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCustomUpload = value !== null && !COURSE_COVERS.some((cover) => cover.src === value);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    // The `accept` attribute is only a filter in the picker dialog; this is the message the user
    // actually sees for an obviously wrong pick. The real gate is POST /api/instructor/course-covers,
    // which sniffs the bytes — same split as app/profile/page.tsx's own avatar picker.
    if (!(file.type in AVATAR_MIME_EXTENSIONS)) {
      setError(COURSE_COVER_TYPE_ERROR);
      return;
    }
    const sizeError = courseCoverSizeError(file.size);
    if (sizeError) {
      setError(sizeError);
      return;
    }

    setError('');
    setUploading(true);
    const result = await uploadCourseCover(token, file);
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChange(result.data.url);
  }

  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">Cover image</p>

      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          aria-label="Automatic cover"
          className={`flex h-14 items-center justify-center rounded-brand-md border text-[10px] font-bold uppercase tracking-wide transition ${
            value === null
              ? 'border-brand-purple bg-brand-purple/20 text-brand-purple'
              : 'border-dashed border-brand-navy-border text-brand-ink-muted hover:border-brand-purple/60'
          }`}
        >
          Auto
        </button>
        {COURSE_COVERS.map((cover, index) => (
          <button
            key={cover.src}
            type="button"
            onClick={() => onChange(cover.src)}
            aria-pressed={value === cover.src}
            aria-label={`Use default cover ${index + 1}`}
            className={`h-14 overflow-hidden rounded-brand-md border transition ${
              value === cover.src ? 'border-brand-purple ring-2 ring-brand-purple/50' : 'border-brand-navy-border hover:border-brand-purple/60'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.src} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {value !== null && isCustomUpload ? (
        <div className="mt-2.5 flex items-center gap-2.5 rounded-brand-md border border-brand-purple bg-brand-navy-2 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-10 w-14 flex-none rounded object-cover" />
          <p className="flex-1 truncate text-xs font-semibold text-brand-ink">Your uploaded image</p>
          <button type="button" onClick={() => onChange(null)} className="flex-none text-xs font-bold text-brand-ink-muted transition hover:text-white">
            Remove
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="mt-2.5 rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2 text-xs font-extrabold text-brand-ink-muted transition hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading ? 'Uploading…' : 'Upload your own image'}
      </button>
      <input ref={fileInputRef} type="file" accept={COURSE_COVER_ACCEPT_ATTRIBUTE} className="hidden" onChange={handleFileChange} />

      {error ? <p className="mt-2 text-xs font-bold text-brand-danger">{error}</p> : null}
    </div>
  );
}
