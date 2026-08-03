import type { StudentActivitySummary } from '../lib/activityLogTypes';

// Deliberately simple, visible thresholds rather than a statistical model — an instructor
// scanning a roster needs a reason they can eyeball, not a black-box score.
const LOW_SCORE_THRESHOLD = 70;
const HIGH_ABANDON_THRESHOLD = 2;

export type StudentAggregate = {
  studentId: string;
  studentName: string;
  attempts: number;
  averageScore: number | null;
  abandonedCount: number;
  needsAttention: boolean;
};

/** One row per student instead of one per attempt — the roster answers "who", the table below answers "what happened". */
export function summarizeStudents(entries: StudentActivitySummary[]): StudentAggregate[] {
  const byStudent = new Map<string, StudentActivitySummary[]>();
  for (const entry of entries) {
    const list = byStudent.get(entry.studentId) ?? [];
    list.push(entry);
    byStudent.set(entry.studentId, list);
  }

  return [...byStudent.entries()]
    .map(([studentId, list]) => {
      const completed = list.filter((entry) => entry.status === 'completed');
      const averageScore =
        completed.length === 0 ? null : Math.round(completed.reduce((sum, entry) => sum + entry.score, 0) / completed.length);
      const abandonedCount = list.filter((entry) => entry.status === 'abandoned').length;

      return {
        studentId,
        studentName: list[0].studentName,
        attempts: list.length,
        averageScore,
        abandonedCount,
        needsAttention: (averageScore !== null && averageScore < LOW_SCORE_THRESHOLD) || abandonedCount >= HIGH_ABANDON_THRESHOLD,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
}

/**
 * The class roster: one card per student, flagging low average scores or repeated abandons so
 * "who needs help" (the literal goal of GitHub #82's user story) reads at a glance rather than
 * requiring a scan of every row in the attempts table. Clicking a card sets the Student filter
 * below to that student — a light stand-in for a full per-student detail page.
 */
export function InstructorRoster({
  students,
  selectedStudentId,
  onSelectStudent,
}: {
  students: StudentAggregate[];
  selectedStudentId: string;
  onSelectStudent: (studentId: string) => void;
}) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {students.map((student) => {
        const isSelected = selectedStudentId === student.studentId;
        return (
          <button
            key={student.studentId}
            type="button"
            onClick={() => onSelectStudent(isSelected ? 'all' : student.studentId)}
            className={`rounded-brand-lg border p-4 text-left transition ${
              isSelected
                ? 'border-brand-purple bg-brand-purple/5'
                : student.needsAttention
                  ? 'border-brand-danger/40 bg-brand-danger/5 hover:border-brand-danger'
                  : 'border-gray-100 bg-gray-50 hover:border-brand-purple/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-brand-navy">{student.studentName}</span>
              {student.needsAttention ? (
                <span className="inline-flex flex-none items-center rounded-full bg-brand-danger/15 px-2 py-0.5 text-[11px] font-extrabold text-brand-danger">
                  Needs attention
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-xs font-semibold text-gray-500">
              {student.attempts} attempt{student.attempts === 1 ? '' : 's'} · {student.abandonedCount} abandoned
            </p>
            <p className="mt-0.5 text-xs font-semibold text-gray-500">
              Average score: {student.averageScore === null ? '—' : `${student.averageScore}%`}
            </p>
          </button>
        );
      })}
    </div>
  );
}
