import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/activities/types
 *
 * Creates a new activity type in the activity_type lookup table.
 * Only instructors can create activity types.
 *
 * Body: { activityType: string }
 * Returns: { activity_type: string }
 */
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json({ error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' }, { status: guard.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { activityType } = (body ?? {}) as { activityType?: unknown };

  if (typeof activityType !== 'string' || activityType.trim() === '') {
    return Response.json({ error: 'activityType is required.' }, { status: 400 });
  }

  const trimmed = activityType.trim();
  if (trimmed.length > 50) {
    return Response.json({ error: 'activityType must be 50 characters or fewer.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('activity_type')
    .insert({ activity_type: trimmed })
    .select('activity_type')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'Activity type already exists.' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ activity_type: (data as { activity_type: string }).activity_type }, { status: 201 });
}
