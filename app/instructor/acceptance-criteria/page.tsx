'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { AcceptanceCriteriaSubmissionRow } from '../../../components/AcceptanceCriteriaSubmissionRow';
import {
  loadInstructorACSubmissions,
  type InstructorACSubmission,
} from '../../../lib/acceptanceCriteriaClient';
import type { StudentFilterValue, InstructorSortOrder } from '../../../components/InstructorFilters';
import { useRequireRole } from '../../../lib/useRequireRole';

const PAGE_SIZE = 10;

export default function ACSubmissionsPage() {
  return (
    <Suspense fallback={null}>
      <ACSubmissionsContent />
    </Suspense>
  );
}

function ACSubmissionsContent() {
  const { token, loading, authorized } = useRequireRole('instructor');
  const searchParams = useSearchParams();

  const [submissions, setSubmissions] = useState<InstructorACSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<StudentFilterValue>('all');
  const [sort, setSort] = useState<InstructorSortOrder>('newest');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    loadInstructorACSubmissions(token).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setSubmissions(result.data.submissions);
      } else {
        setError(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const studentParam = searchParams.get('student');
    if (studentParam) setStudentId(studentParam);
  }, [searchParams]);

  const students = useMemo(() => {
    if (!submissions) return [];
    const seen = new Map<string, string>();
    for (const s of submissions) {
      if (!seen.has(s.studentId)) seen.set(s.studentId, s.studentName);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [submissions]);

  const filteredSorted = useMemo(() => {
    const rows = (submissions ?? []).filter((s) => studentId === 'all' || s.studentId === studentId);
    return [...rows].sort((a, b) => {
      if (sort === 'oldest') return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
      if (sort === 'lowest') {
        if (a.llmScore === null) return 1;
        if (b.llmScore === null) return -1;
        return a.llmScore - b.llmScore;
      }
      if (sort === 'highest') {
        if (a.llmScore === null) return 1;
        if (b.llmScore === null) return -1;
        return b.llmScore - a.llmScore;
      }
      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
    });
  }, [submissions, studentId, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredSorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleStudentChange(value: StudentFilterValue) {
    setStudentId(value);
    setPage(1);
  }

  function handleSortChange(value: InstructorSortOrder) {
    setSort(value);
    setPage(1);
  }

  if (loading || !authorized) return null;

  return (
    <AppShell active="instructor-ac">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">AC Submissions</h1>
        <p className="mb-6 max-w-2xl text-sm font-semibold text-gray-500">
          Every student&apos;s acceptance criteria submissions — filter by student or sort to find what you need.
        </p>

        {error ? (
          <p className="mb-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
            {error}
          </p>
        ) : submissions === null ? (
          <p className="text-sm font-semibold text-gray-500">Loading…</p>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <label className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">
                Student
                <select
                  value={studentId}
                  onChange={(e) => handleStudentChange(e.target.value)}
                  className="mt-1 block rounded-brand-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-bold text-gray-600 outline-none transition focus:border-brand-purple"
                >
                  <option value="all">All students</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">
                Sort
                <select
                  value={sort}
                  onChange={(e) => handleSortChange(e.target.value as InstructorSortOrder)}
                  className="mt-1 block rounded-brand-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-bold text-gray-600 outline-none transition focus:border-brand-purple"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="lowest">Lowest score first</option>
                  <option value="highest">Highest score first</option>
                </select>
              </label>
            </div>

            {pageRows.length === 0 ? (
              <p className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
                {studentId !== 'all' ? 'No submissions from this student yet.' : 'No submissions yet.'}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      {studentId === 'all' && (
                        <th className="px-4 py-2.5 text-left text-xs font-extrabold uppercase tracking-wide">Student</th>
                      )}
                      <th className="px-4 py-2.5 text-left text-xs font-extrabold uppercase tracking-wide">User Story</th>
                      <th className="px-4 py-2.5 text-left text-xs font-extrabold uppercase tracking-wide">Score</th>
                      <th className="px-4 py-2.5 text-left text-xs font-extrabold uppercase tracking-wide">Submitted</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((submission) => (
                      <AcceptanceCriteriaSubmissionRow
                        key={submission.submissionId}
                        submission={submission}
                        showStudent={studentId === 'all'}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-gray-500">
                {filteredSorted.length === 0
                  ? '0 submissions'
                  : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredSorted.length)} of ${filteredSorted.length} submissions`}
              </span>

              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="min-w-9 rounded-brand-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-600 transition hover:border-brand-purple hover:text-brand-purple disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-600"
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`min-w-9 rounded-brand-md border px-2.5 py-1.5 text-xs font-bold transition ${
                      p === currentPage
                        ? 'border-brand-purple bg-brand-purple text-white'
                        : 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="min-w-9 rounded-brand-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-600 transition hover:border-brand-purple hover:text-brand-purple disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-600"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
