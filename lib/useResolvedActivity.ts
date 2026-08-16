'use client';

// Resolves an app/activities/[slug] route segment to an ActivityDefinition, whether it's one of
// the three built-ins lib/activityContent.ts knows statically or a course-scoped custom catalog
// reached directly by its activity_type key. Shared by app/activities/[slug]/page.tsx and its
// play page — both used to call getActivity(params.slug) directly and treat a miss as "doesn't
// exist"; now a miss means "check the server" before giving up, since every activity_type is
// reachable by a student enrolled in its course (activity_type_course), not just the three
// hardcoded ones.

import { useEffect, useState } from 'react';
import { type ActivityDefinition, buildCustomActivityDefinition, getActivity } from './activityContent';
import { loadActivityMeta } from './activityDiscoveryClient';

export type ResolvedActivityStatus = 'loading' | 'found' | 'not-found' | 'forbidden';

export type ResolvedActivity = { activity: ActivityDefinition | null; status: ResolvedActivityStatus };

/**
 * The static lookup is checked first and, when it hits, this never touches the network at all —
 * zero behavior change for the two Type A activities and Write Acceptance Criteria's own static
 * route, which is the overwhelming majority of traffic through these pages. Only an unrecognized
 * slug triggers GET /api/activities/{activityType} (lib/activityDiscoveryClient.ts), which itself
 * enforces the same course-enrollment gate POST /api/sessions does — a 403 there means the caller
 * genuinely cannot see this activity, not that it doesn't exist, and the two are surfaced
 * separately (status: 'forbidden' vs 'not-found') so the page can say which.
 */
export function useResolvedActivity(token: string | null, slug: string): ResolvedActivity {
  const staticActivity = getActivity(slug);

  const [dynamic, setDynamic] = useState<ResolvedActivity>(
    staticActivity ? { activity: staticActivity, status: 'found' } : { activity: null, status: 'loading' },
  );

  useEffect(() => {
    if (staticActivity) {
      setDynamic({ activity: staticActivity, status: 'found' });
      return;
    }
    if (!token) {
      setDynamic({ activity: null, status: 'loading' });
      return;
    }

    let cancelled = false;
    setDynamic({ activity: null, status: 'loading' });

    loadActivityMeta(token, slug).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setDynamic({ activity: buildCustomActivityDefinition(result.data.activity), status: 'found' });
      } else if (result.status === 403) {
        setDynamic({ activity: null, status: 'forbidden' });
      } else {
        // 404, or anything else unexpected — collapse to 'not-found' rather than leaving the
        // page stuck on a permanent loading state.
        setDynamic({ activity: null, status: 'not-found' });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token, slug, staticActivity]);

  return dynamic;
}
