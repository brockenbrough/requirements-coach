export type StudentFilterValue = 'all' | string;
export type LevelFilterValue = 'all' | 1 | 2 | 3;
export type InstructorSortOrder = 'newest' | 'oldest' | 'lowest' | 'highest';

const LEVELS: LevelFilterValue[] = ['all', 1, 2, 3];

/** Student dropdown + Level pills + sort, for the Instructor Dashboard (GitHub #82) table. */
export function InstructorFilters({
  students,
  studentId,
  level,
  sort,
  onStudentChange,
  onLevelChange,
  onSortChange,
}: {
  students: { id: string; name: string }[];
  studentId: StudentFilterValue;
  level: LevelFilterValue;
  sort: InstructorSortOrder;
  onStudentChange: (value: StudentFilterValue) => void;
  onLevelChange: (value: LevelFilterValue) => void;
  onSortChange: (value: InstructorSortOrder) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">
          Student
          <select
            value={studentId}
            onChange={(event) => onStudentChange(event.target.value)}
            className="mt-1 block rounded-brand-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-bold text-gray-600 outline-none transition focus:border-brand-purple"
          >
            <option value="all">All students</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">Level</span>
          <div className="mt-1 flex gap-1.5">
            {LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => onLevelChange(lvl)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                  level === lvl
                    ? 'border-brand-purple bg-brand-purple text-white'
                    : 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple'
                }`}
              >
                {lvl === 'all' ? 'All' : `Level ${lvl}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">
        Sort
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as InstructorSortOrder)}
          className="mt-1 block rounded-brand-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-bold text-gray-600 outline-none transition focus:border-brand-purple"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="lowest">Lowest score first</option>
          <option value="highest">Highest score first</option>
        </select>
      </label>
    </div>
  );
}
