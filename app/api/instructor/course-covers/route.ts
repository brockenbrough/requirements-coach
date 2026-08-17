import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import {
  AVATAR_HEADER_BYTES,
  AVATAR_MIME_EXTENSIONS,
  AVATAR_TYPE_ERROR,
  courseCoverSizeError,
  sniffAvatarMime,
} from '../../../../lib/imageRules';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/instructor/course-covers — uploads an image to the public `course-covers` Storage
 * bucket and returns its public URL (GitHub #363 follow-up). Deliberately not scoped to a
 * specific course (contrast POST /api/profile/avatar, keyed by the caller's own user id): a
 * cover picked while *creating* a course has no course_id yet to key on, and the same upload
 * flow is reused by the Edit Course form afterward — so this route only ever hands back a URL,
 * and it's the caller's job (POST/PATCH /api/instructor/courses[/{id}]'s coverImageUrl field) to
 * attach it to a course. Every write goes through the service-role client, same as avatars — the
 * bucket has no RLS policy of its own.
 *
 * The storage key is `{instructorId}/{uuid}.{ext}`, never the client-supplied filename, for the
 * same stored-XSS reason POST /api/profile/avatar's key is derived from sniffed bytes, not
 * `file.name`/`file.type`. Unlike avatars there is no upsert-and-clean-up-the-old-key dance: each
 * upload gets a fresh random key, so re-uploading (or picking a different course entirely) never
 * collides with or silently replaces a previous cover. That does mean an instructor who uploads
 * repeatedly, or deletes a course, leaves its old cover orphaned in the bucket — a known,
 * accepted gap (same shape as the leaderboard cache's own documented staleness limits), not
 * something this route tries to solve.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body, matching requireInstructor's convention)
 * - 400 no image field, image too large/empty, or bytes that don't sniff as PNG/JPEG/WebP
 * - 200 { url }
 * - 500 Supabase not configured, or the storage upload fails
 */
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Invalid form data.' }, { status: 400 });
  }

  const file = formData.get('image');
  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: 'image file is required.' }, { status: 400 });
  }

  const sizeError = courseCoverSizeError(file.size);
  if (sizeError) return Response.json({ error: sizeError }, { status: 400 });

  const head = new Uint8Array(await file.slice(0, AVATAR_HEADER_BYTES).arrayBuffer());
  const mime = sniffAvatarMime(head);
  if (!mime) return Response.json({ error: AVATAR_TYPE_ERROR }, { status: 400 });

  const extension = AVATAR_MIME_EXTENSIONS[mime];
  const path = `${guard.user_id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('course-covers')
    .upload(path, file, { upsert: false, contentType: mime });

  if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });

  const {
    data: { publicUrl },
  } = supabase.storage.from('course-covers').getPublicUrl(path);

  return Response.json({ url: publicUrl }, { status: 200 });
}
