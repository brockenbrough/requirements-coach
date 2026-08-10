import Link from 'next/link';
import { getInitials } from '../lib/initials';

/** GitHub #127: header for the student detail page — name, avatar, "Needs attention" badge, back link. */
export function StudentDetailHeader({
  studentName,
  needsAttention,
  summaryLine,
}: {
  studentName: string;
  needsAttention: boolean;
  summaryLine: string;
}) {
  return (
    <>
      <Link href="/instructor/students" className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-brand-navy">
        ← Back to Students
      </Link>

      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full border-[3px] border-brand-gold bg-brand-navy-2 text-lg font-extrabold text-brand-gold">
            {getInitials(null, null, studentName)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-brand-navy">{studentName}</h1>
              {needsAttention ? (
                <span className="inline-flex items-center rounded-full bg-brand-danger/15 px-2.5 py-0.5 text-xs font-extrabold text-brand-danger">
                  Needs attention
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm font-semibold text-gray-500">{summaryLine}</p>
          </div>
        </div>
      </div>
    </>
  );
}
