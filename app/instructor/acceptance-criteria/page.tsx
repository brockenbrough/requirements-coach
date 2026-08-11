'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { AcceptanceCriteriaSubmissionRow } from '../../../components/AcceptanceCriteriaSubmissionRow';
import { PaginationControls } from '../../../components/PaginationControls';
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

  const [allSubmissions, setAllSubmissions] = useState<InstructorACSubmission[] | null>(null);
  const [submissions, setSubmissions] = useState<InstructorACSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<StudentFilterValue>('all');
  const [sort, setSort] = useState<InstructorSortOrder>('newest');
  const [page, setPage] = useState(1);

  // Load all submissions once to populate the student dropdown.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    loadInstructorACSubmissions(token).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setAllSubmissions(result.data.submissions);
        setSubmissions(result.data.submissions);
      } else {
        setError(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Re-fetch from API when student filter changes — server-side filter is reliable.
  useEffect(() => {
    if (!token || allSubmissions === null) return;
    let cancelled = false;

    if (studentId === 'all') {
      setSubmissions(allSubmissions);
      return;
    }

    loadInstructorACSubmissions(token, { studentId }).then((result) => {
      if (cancelled) return;
      if (result.ok) setSubmissions(result.data.submissions);
      else setError(result.error);
    });

    return () => {
      cancelled = true;
    };
  }, [token, studentId, allSubmissions]);

  useEffect(() => {
    const studentParam = searchParams.get('student');
    if (studentParam) setStudentId(studentParam);
  }, [searchParams]);

  const students = useMemo(() => {
    if (!allSubmissions) return [];
    const submissions = allSubmissions;
    const seen = new Map<string, string>();
    for (const s of submissions) {
      if (!seen.has(s.studentId)) seen.set(s.studentId, s.studentName);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [submissions]);

  const filteredSorted = useMemo(() => {
    return [...(submissions ?? [])].sort((a, b) => {
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
        <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Acceptance Criteria Submissions</h1>
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
            <div className="mb-5 flex flex-wrap items-end gap-4">
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

            <div className="overflow-x-auto rounded-brand-lg border border-brand-navy-border">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="bg-brand-navy text-brand-ink-muted">
                    {studentId === 'all' && (
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Student</th>
                    )}
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">User Story</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Score</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Submitted</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={studentId === 'all' ? 5 : 4}
                        className="bg-brand-navy-2 px-4 py-10 text-center text-sm font-semibold text-brand-ink-muted"
                      >
                        {studentId !== 'all' ? 'No submissions from this student yet.' : 'No submissions yet.'}
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((submission) => (
                      <AcceptanceCriteriaSubmissionRow
                        key={submission.submissionId}
                        submission={submission}
                        showStudent={studentId === 'all'}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-gray-500">
                {filteredSorted.length === 0
                  ? '0 submissions'
                  : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredSorted.length)} of ${filteredSorted.length} submissions`}
              </span>

              <PaginationControls currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
