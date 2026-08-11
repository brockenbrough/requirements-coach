// Shared between lib/courseClient.ts ('use client') and the instructor course routes, so the
// routes can hand these types to whatever needs them without importing anything client-side.
// Same reason sessionTypes.ts exists — imports nothing itself.

/** Fields every course response shares, regardless of how much else it discloses. */
export type CourseMeta = {
  id: string;
  name: string;
  code: string;
  createdAt: string;
};

export type CourseSummary = CourseMeta & { studentCount: number };

export type CourseStudent = {
  id: string;
  name: string;
  attempts: number;
  averageScore: number | null;
  abandonedCount: number;
  needsAttention: boolean;
};

export type CourseDetail = CourseMeta & { students: CourseStudent[] };
