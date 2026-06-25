import { getSupabaseClient } from '../../../../lib/supabase';

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

  const ext = file instanceof File ? (file.name.split('.').pop() ?? 'jpg') : 'jpg';
  const path = `${user.id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true });

  if (uploadError) return Response.json({ error: uploadError.message }, { status: 400 });

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

  const { data, error: updateError } = await supabase
    .from('myapp_profile')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id)
    .select('id, username, biography, avatar_url')
    .single();

  if (updateError) return Response.json({ error: updateError.message }, { status: 400 });

  return Response.json({ profile: data }, { status: 200 });
}
