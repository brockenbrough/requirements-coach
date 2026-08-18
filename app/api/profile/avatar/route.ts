import { getSupabaseClient } from '../../../../lib/supabase';
import {
  AVATAR_HEADER_BYTES,
  AVATAR_MIME_EXTENSIONS,
  AVATAR_TYPE_ERROR,
  avatarSizeError,
  sniffAvatarMime,
} from '../../../../lib/imageRules';
import { PROFILE_COLUMNS } from '../../../../lib/profileQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

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

  // Size first, so an oversized upload is rejected before any of it is read (GitHub #278).
  const sizeError = avatarSizeError(file.size);
  if (sizeError) return Response.json({ error: sizeError }, { status: 400 });

  // The declared `file.type` and `file.name` are deliberately ignored — both are client input, and
  // the bucket is public, so a .svg/.html slipping through would be served back as executable
  // stored XSS. The magic bytes decide the format, and the format decides the key's extension.
  const head = new Uint8Array(await file.slice(0, AVATAR_HEADER_BYTES).arrayBuffer());
  const mime = sniffAvatarMime(head);
  if (!mime) return Response.json({ error: AVATAR_TYPE_ERROR }, { status: 400 });

  const extension = AVATAR_MIME_EXTENSIONS[mime];
  const path = `${user.id}.${extension}`; // user.id comes from the token, so it can't traverse.

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: mime });

  if (uploadError) return Response.json({ error: uploadError.message }, { status: 400 });

  // `upsert` only overwrites the identical key, so switching format would otherwise leave the
  // previous avatar behind — still publicly reachable. Best-effort: a failure here is not the
  // caller's problem, the new avatar is already stored.
  const staleKeys = Object.values(AVATAR_MIME_EXTENSIONS)
    .filter((other) => other !== extension)
    .map((other) => `${user.id}.${other}`);
  await supabase.storage.from('avatars').remove(staleKeys);

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

  const { data, error: updateError } = await supabase
    .from('user')
    .update({ avatar_url: publicUrl })
    .eq('user_id', user.id)
    .select(PROFILE_COLUMNS)
    .single();

  if (updateError) return Response.json({ error: updateError.message }, { status: 400 });

  return Response.json({ profile: data }, { status: 200 });
}
