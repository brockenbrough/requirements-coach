'use strict';

// Shared config + helpers for scripts/seed-load-test.js and scripts/cleanup-load-test.js
// (GitHub #275 / REQ-PL-3.4.4 — "3 courses, 3 instructors, 150 students each" load-test data).
//
// Both scripts connect directly to Supabase with the service-role key (same credential
// lib/supabase.ts's getSupabaseAdminClient() uses) rather than going through the Next.js HTTP
// API — the API has no bulk-insert routes, and hitting POST /api/sessions 450+ times would be
// far slower than batched table inserts. The one call that genuinely has no bulk equivalent is
// Supabase's auth admin API (auth.admin.createUser/deleteUser) — every other insert/delete here
// is chunked into as few round trips as the payload size allows.
//
// Every row this creates is identifiable by construction, without a schema change:
//   - every account's email ends in @test.local (TEST_EMAIL_DOMAIN)
//   - the 3 courses use fixed, recognizable course codes (COURSES[].courseCode)
//   - every catalog's activity_type key derives from a fixed, recognizable name (COURSES[].quizzes[].name)
// cleanup-load-test.js locates everything to remove through those three anchors, not a stored flag.
//
// Follow-up to the original #275 seed (3 quizzes/course + deterministic result groups, so the
// instructor dashboard and student leaderboard have something other than one uniform quiz to
// show): every course gets COURSES[].quizzes.length separate catalogs+assembled quizzes, not one,
// and every (student, quiz) pair is independently placed into one of RESULT_GROUPS below rather
// than a free-form random score. Login credentials for one instructor+student pair per course are
// printed at the end of seed-load-test.js and written to test-credentials.txt.

const fs = require('fs');
const path = require('path');

const TEST_EMAIL_DOMAIN = '@test.local';
const TEST_PASSWORD = 'LoadTest#2026!';

// Overridable via LOAD_TEST_STUDENTS_PER_COURSE for a cheap dry run (e.g. 5 students/course)
// before committing to the full 150 — everything else in this file stays identical either way.
const STUDENTS_PER_COURSE = Number(process.env.LOAD_TEST_STUDENTS_PER_COURSE) || 150;

// Mirrors lib/sessionRules.ts — kept as separate constants here (not a shared import) because
// this script runs standalone with `node`, outside the Next.js/TypeScript build.
const QUESTIONS_PER_LEVEL = 4; // QUESTIONS_PER_SESSION / MIN_QUESTIONS_PER_LEVEL
const MAX_DIFFICULTY_LEVEL = 3;
const PASS_RATIO = 0.75;
const MCQ_POINTS_BY_DIFFICULTY = { 1: 10, 2: 20, 3: 30 };

/** Mirrors lib/activityTypes.ts's slugifyQuizName exactly, so the derived activity_type key here is
 * the same one POST /api/activities/types would have produced for the same catalog name. */
function slugifyQuizName(name) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function studentEmail(prefix, n) {
  return `${prefix}${String(n).padStart(3, '0')}${TEST_EMAIL_DOMAIN}`;
}

// Each course gets 3 quizzes (AC: "mindestens 2-3"): the first is the full 3-level catalog the
// original #275 seed had, the other two are deliberately smaller ("ein paar einfache
// Testfragen") — Easy-only, 4 questions, just enough to satisfy MIN_QUESTIONS_PER_LEVEL and let a
// session actually be played. Every quiz gets its own catalog (activity_type) — "inkl.
// zugehörigem Fragenkatalog" — never shared across quizzes, so excluding/editing one never
// touches another.
const COURSES = [
  {
    key: 'A',
    courseName: 'Load Test Course A',
    courseCode: 'TESTCLASS1',
    studentEmailPrefix: 'student_c1_',
    instructor: { email: 'prof_test_1@test.local', firstName: 'Prof.', lastName: 'Test One', username: 'prof_test_1' },
    quizzes: [
      { name: 'Load Test Quiz Bank A1', levels: [1, 2, 3] },
      { name: 'Load Test Quiz Bank A2', levels: [1] },
      { name: 'Load Test Quiz Bank A3', levels: [1] },
    ],
  },
  {
    key: 'B',
    courseName: 'Load Test Course B',
    courseCode: 'TESTCLASS2',
    studentEmailPrefix: 'student_c2_',
    instructor: { email: 'prof_test_2@test.local', firstName: 'Prof.', lastName: 'Test Two', username: 'prof_test_2' },
    quizzes: [
      { name: 'Load Test Quiz Bank B1', levels: [1, 2, 3] },
      { name: 'Load Test Quiz Bank B2', levels: [1] },
      { name: 'Load Test Quiz Bank B3', levels: [1] },
    ],
  },
  {
    key: 'C',
    courseName: 'Load Test Course C',
    courseCode: 'TESTCLASS3',
    studentEmailPrefix: 'student_c3_',
    instructor: { email: 'prof_test_3@test.local', firstName: 'Prof.', lastName: 'Test Three', username: 'prof_test_3' },
    quizzes: [
      { name: 'Load Test Quiz Bank C1', levels: [1, 2, 3] },
      { name: 'Load Test Quiz Bank C2', levels: [1] },
      { name: 'Load Test Quiz Bank C3', levels: [1] },
    ],
  },
];

/**
 * Follow-up AC: every (student, quiz) pair independently lands in one of these 4 groups, ~25%
 * each ("ungefähr gleiche Teile") — so two quizzes in the same course don't show identical
 * per-student results. correctFraction is out of QUESTIONS_PER_LEVEL (always 4): 'full' passes
 * (>=75%), 'partial' and 'zero' both fail, 'notStarted' gets no session_log row at all.
 */
const RESULT_GROUPS = [
  { key: 'full', label: 'Fully correct', correctFraction: 1 },
  { key: 'partial', label: 'Partially correct', correctFraction: 0.5 },
  { key: 'zero', label: 'Fully incorrect', correctFraction: 0 },
  { key: 'notStarted', label: 'Not started', correctFraction: null },
];

// 4 questions per level x 3 levels per catalog — QUESTIONS_PER_LEVEL exactly, so every session
// (which always draws the whole level pool here) has a full, non-repeating set of 4 questions,
// same as a real MCQ catalog needs at minimum (MIN_QUESTIONS_PER_LEVEL). Reused verbatim across
// all 3 catalogs — they're independent activity_type keys, so identical text across catalogs A/B/C
// is not a collision.
const QUESTION_BANK = {
  1: [
    {
      prompt: 'Which of the following best describes a functional requirement?',
      options: [
        { text: 'A statement of what the system must do', correct: true },
        { text: 'A statement of how fast the system must respond', correct: false },
        { text: "A description of the team's coding standards", correct: false },
        { text: 'A description of the deployment environment', correct: false },
      ],
    },
    {
      prompt: 'What is the primary purpose of a user story?',
      options: [
        { text: 'To capture a feature from the perspective of an end user', correct: true },
        { text: 'To document the database schema', correct: false },
        { text: 'To list every acceptance test in full detail', correct: false },
        { text: 'To replace the need for a requirements document', correct: false },
      ],
    },
    {
      prompt: 'Which of these is a non-functional requirement?',
      options: [
        { text: 'The system must respond within 2 seconds', correct: true },
        { text: 'The system must let a user reset their password', correct: false },
        { text: 'The system must display a list of products', correct: false },
        { text: 'The system must send a confirmation email', correct: false },
      ],
    },
    {
      prompt: 'What does the acronym MVP stand for in product development?',
      options: [
        { text: 'Minimum Viable Product', correct: true },
        { text: 'Most Valuable Prototype', correct: false },
        { text: 'Managed Verification Process', correct: false },
        { text: 'Minimum Validated Plan', correct: false },
      ],
    },
  ],
  2: [
    {
      prompt: 'Which INVEST criterion means a user story should be understandable without needing other stories to be completed first?',
      options: [
        { text: 'Independent', correct: true },
        { text: 'Negotiable', correct: false },
        { text: 'Estimable', correct: false },
        { text: 'Testable', correct: false },
      ],
    },
    {
      prompt: "A requirement stating 'the system must handle 10,000 concurrent users' is best classified as which type of requirement?",
      options: [
        { text: 'Performance / scalability requirement', correct: true },
        { text: 'Functional requirement', correct: false },
        { text: 'Business rule', correct: false },
        { text: 'User interface requirement', correct: false },
      ],
    },
    {
      prompt: "What is the main risk of writing a requirement as 'the system should be fast'?",
      options: [
        { text: 'It is not measurable or testable', correct: true },
        { text: 'It is too short to read', correct: false },
        { text: 'It is a functional requirement', correct: false },
        { text: 'It cannot be assigned to a developer', correct: false },
      ],
    },
    {
      prompt: 'Which elicitation technique is most suitable for gathering requirements from a large, diverse group of stakeholders at once?',
      options: [
        { text: 'Workshops or focus groups', correct: true },
        { text: 'One-on-one interviews only', correct: false },
        { text: 'Reading competitor documentation', correct: false },
        { text: 'Guessing based on similar products', correct: false },
      ],
    },
  ],
  3: [
    {
      prompt: 'In a distributed system, which non-functional requirement category addresses the ability to add capacity without redesigning the architecture?',
      options: [
        { text: 'Scalability', correct: true },
        { text: 'Usability', correct: false },
        { text: 'Maintainability', correct: false },
        { text: 'Portability', correct: false },
      ],
    },
    {
      prompt: 'Which requirements engineering artifact best captures the rationale behind a specific design decision?',
      options: [
        { text: 'An architectural decision record (ADR)', correct: true },
        { text: 'A user story', correct: false },
        { text: 'A use case diagram', correct: false },
        { text: 'A test case', correct: false },
      ],
    },
    {
      prompt: 'Two stakeholders provide directly conflicting requirements. Which technique is most appropriate to resolve the conflict?',
      options: [
        { text: 'Prioritization and negotiation with both stakeholders', correct: true },
        { text: 'Implementing whichever requirement was received first', correct: false },
        { text: 'Ignoring both requirements', correct: false },
        { text: 'Letting a single developer decide unilaterally', correct: false },
      ],
    },
    {
      prompt: 'Which format best captures a non-functional requirement in a precise, testable way?',
      options: [
        { text: 'A quality attribute scenario (stimulus, environment, response, response measure)', correct: true },
        { text: 'A single adjective describing the desired quality', correct: false },
        { text: 'A user story written in first person', correct: false },
        { text: 'A free-text paragraph with no structure', correct: false },
      ],
    },
  ],
};

/** Minimal .env.local parser — this script runs standalone via `node`, so it can't rely on
 * Next.js's own env loading. Same two keys app/api/auth/register/route.ts's getSupabaseAdminClient
 * needs: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY. */
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

/** Runs `fn` over `items` with at most `limit` in flight at once — used for the per-account auth
 * admin calls, which have no bulk equivalent (see the header comment above). */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function withRetry(fn, { attempts = 4, baseDelayMs = 500 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** i));
    }
  }
  throw lastError;
}

/** Every auth user whose email ends in @test.local, keyed by lower-cased email — the one query
 * both scripts need: seed uses it to skip accounts that already exist, cleanup uses it to find
 * every account to remove. Paginated (perPage 1000) since auth.admin.listUsers has no `.in()`. */
async function listAllTestUsers(supabase) {
  const result = new Map();
  let page = 1;
  const perPage = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`);
    for (const u of data.users) {
      if (u.email && u.email.toLowerCase().endsWith(TEST_EMAIL_DOMAIN)) {
        result.set(u.email.toLowerCase(), u);
      }
    }
    if (data.users.length < perPage) break;
    page++;
  }
  return result;
}

module.exports = {
  TEST_EMAIL_DOMAIN,
  TEST_PASSWORD,
  STUDENTS_PER_COURSE,
  QUESTIONS_PER_LEVEL,
  MAX_DIFFICULTY_LEVEL,
  PASS_RATIO,
  MCQ_POINTS_BY_DIFFICULTY,
  QUESTION_BANK,
  COURSES,
  RESULT_GROUPS,
  slugifyQuizName,
  studentEmail,
  loadEnv,
  chunk,
  mapLimit,
  withRetry,
  listAllTestUsers,
};
