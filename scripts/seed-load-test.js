'use strict';

// GitHub #275 / REQ-PL-3.4.4 — seeds 3 courses, taught by 3 different instructors, with 150
// students each (450 total), plus enough real session_log/answered_question_log activity per
// student that the instructor dashboard, course cards, leaderboards and activity logs all have
// non-empty, realistically-varying data to load-test against.
//
// Follow-up (same issue thread): 3 quizzes per course instead of 1, every (student, quiz) pair
// independently placed into one of RESULT_GROUPS (loadTestConfig.js) rather than a free-form
// random score, and login credentials for one instructor+student pair per course printed at the
// end — see main()'s final section and test-credentials.txt.
//
// Idempotent: every entity is looked up by a deterministic key before being created (email for
// accounts, course_code for courses, the derived activity_type for catalogs, (course_id,user_id)
// for enrollments, "does this student already have a session for this activity_type" for activity
// data) — rerunning this script tops up whatever is missing instead of duplicating anything. One
// known limitation: a student who landed in the 'notStarted' group has, by definition, no
// session_log row, so a rerun can't tell "deliberately not started" apart from "never processed"
// and may draw them into a fresh group assignment — harmless (still no duplicates, ratios stay
// close to even) but worth knowing if you rerun the same course multiple times.
//
// Run: node scripts/seed-load-test.js  (or `npm run seed:load-test`)
// Undo: node scripts/cleanup-load-test.js --confirm  (or `npm run cleanup:load-test`)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const {
  TEST_PASSWORD,
  STUDENTS_PER_COURSE,
  QUESTIONS_PER_LEVEL,
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
} = require('./loadTestConfig');

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Zone-less, matching every other timestamp column in the schema (see CLAUDE.md's "Timestamps
// are zone-less" section) — a naive wall-clock string, not UTC-with-offset.
function randomTimestampWithinDays(days) {
  const past = Date.now() - Math.floor(Math.random() * days * 24 * 60 * 60 * 1000);
  return new Date(past).toISOString().replace('Z', '');
}

// Weighted toward Easy among whichever levels this quiz actually has questions for — a smaller
// quiz (levels: [1]) always resolves to level 1; the full 3-level quiz keeps the original 60/25/15
// spread. Not a progression simulation, just variety across the quizzes that have more than one level.
const LEVEL_WEIGHT = { 1: 0.6, 2: 0.25, 3: 0.15 };
function pickLevel(availableLevels) {
  if (availableLevels.length === 1) return availableLevels[0];
  const total = availableLevels.reduce((sum, l) => sum + LEVEL_WEIGHT[l], 0);
  let r = Math.random() * total;
  for (const level of availableLevels) {
    if (r < LEVEL_WEIGHT[level]) return level;
    r -= LEVEL_WEIGHT[level];
  }
  return availableLevels[availableLevels.length - 1];
}

async function selectExistingIds(supabase, table, column, ids) {
  const found = new Set();
  for (const batch of chunk(ids, 300)) {
    if (batch.length === 0) continue;
    const { data, error } = await supabase.from(table).select(column).in(column, batch);
    if (error) throw new Error(`select ${table}.${column} failed: ${error.message}`);
    for (const row of data) found.add(row[column]);
  }
  return found;
}

async function ensureCourse(supabase, course, instructorId) {
  const { data: existing, error: selErr } = await supabase
    .from('course')
    .select('course_id, course_name, course_code')
    .eq('course_code', course.courseCode)
    .maybeSingle();
  if (selErr) throw new Error(`course lookup failed: ${selErr.message}`);
  if (existing) {
    console.log(`  Course "${existing.course_name}" already exists (code ${existing.course_code}).`);
    return existing;
  }

  const { data, error } = await supabase
    .from('course')
    .insert({
      course_id: crypto.randomUUID(),
      creator_id: instructorId,
      course_name: course.courseName,
      course_code: course.courseCode,
    })
    .select('course_id, course_name, course_code')
    .single();
  if (error) throw new Error(`course insert failed: ${error.message}`);
  console.log(`  Created course "${data.course_name}" (code ${data.course_code}).`);
  return data;
}

/** Every existing question for this catalog, joined to its correct/wrong answer id via two flat
 * lookups instead of a nested PostgREST embed — simpler to get right than reasoning about embed
 * filter syntax, and this only ever runs once per course. */
async function loadExistingQuestions(supabase, activityType) {
  const { data: questions, error: qErr } = await supabase
    .from('question')
    .select('question_id, difficulty_level')
    .eq('activity_type', activityType);
  if (qErr) throw new Error(`question lookup failed: ${qErr.message}`);

  const byLevel = { 1: [], 2: [], 3: [] };
  if (questions.length === 0) return byLevel;

  const questionIds = questions.map((q) => q.question_id);
  const linkRows = [];
  for (const batch of chunk(questionIds, 300)) {
    const { data, error } = await supabase.from('question_to_answer').select('question_id, answer_id').in('question_id', batch);
    if (error) throw new Error(`question_to_answer lookup failed: ${error.message}`);
    linkRows.push(...data);
  }

  const answerIds = linkRows.map((l) => l.answer_id);
  const answerRows = [];
  for (const batch of chunk(answerIds, 300)) {
    const { data, error } = await supabase.from('answer').select('answer_id, is_correct').in('answer_id', batch);
    if (error) throw new Error(`answer lookup failed: ${error.message}`);
    answerRows.push(...data);
  }

  const isCorrectByAnswerId = new Map(answerRows.map((a) => [a.answer_id, a.is_correct]));
  const answerIdsByQuestionId = new Map();
  for (const link of linkRows) {
    if (!answerIdsByQuestionId.has(link.question_id)) answerIdsByQuestionId.set(link.question_id, []);
    answerIdsByQuestionId.get(link.question_id).push(link.answer_id);
  }

  for (const q of questions) {
    const ids = answerIdsByQuestionId.get(q.question_id) || [];
    const correctAnswerId = ids.find((id) => isCorrectByAnswerId.get(id) === true);
    const wrongAnswerId = ids.find((id) => isCorrectByAnswerId.get(id) === false);
    if (!correctAnswerId || !wrongAnswerId) continue; // leftover from an interrupted run; ignored, top-up below replaces it
    byLevel[q.difficulty_level].push({ questionId: q.question_id, correctAnswerId, wrongAnswerId });
  }
  return byLevel;
}

async function createQuestionsBatch(supabase, activityType, level, prompts, instructorId, orderOffset) {
  const answerRows = [];
  const questionRows = [];
  const linkRows = [];
  const created = [];

  prompts.forEach((item, idx) => {
    const questionId = crypto.randomUUID();
    questionRows.push({
      question_id: questionId,
      question_prompt: item.prompt,
      difficulty_level: level,
      activity_type: activityType,
      order_number: orderOffset + idx + 1,
      max_score: MCQ_POINTS_BY_DIFFICULTY[level],
      user_id: instructorId,
    });

    let correctAnswerId = null;
    let wrongAnswerId = null;
    for (const option of item.options) {
      const answerId = crypto.randomUUID();
      answerRows.push({ answer_id: answerId, option_text: option.text, is_correct: option.correct, explanation: null });
      linkRows.push({ question_id: questionId, answer_id: answerId });
      if (option.correct) correctAnswerId = answerId;
      else if (!wrongAnswerId) wrongAnswerId = answerId;
    }
    created.push({ questionId, correctAnswerId, wrongAnswerId });
  });

  // answer/question have no FK to each other; question_to_answer needs both, so it goes last.
  for (const batch of chunk(answerRows, 500)) {
    const { error } = await supabase.from('answer').insert(batch);
    if (error) throw new Error(`answer insert failed: ${error.message}`);
  }
  for (const batch of chunk(questionRows, 500)) {
    const { error } = await supabase.from('question').insert(batch);
    if (error) throw new Error(`question insert failed: ${error.message}`);
  }
  for (const batch of chunk(linkRows, 500)) {
    const { error } = await supabase.from('question_to_answer').insert(batch);
    if (error) throw new Error(`question_to_answer insert failed: ${error.message}`);
  }
  return created;
}

async function ensureCatalogAndQuestions(supabase, quizConfig, activityType, instructorId) {
  const { data: existingCatalog, error: catErr } = await supabase
    .from('activity_type')
    .select('activity_type, quiz_name')
    .eq('activity_type', activityType)
    .maybeSingle();
  if (catErr) throw new Error(`catalog lookup failed: ${catErr.message}`);

  if (!existingCatalog) {
    const { error: insErr } = await supabase.from('activity_type').insert({
      activity_type: activityType,
      quiz_name: quizConfig.name,
      description: 'Load-test seed data (GitHub #275) — safe to remove via scripts/cleanup-load-test.js.',
      grading_kind: 'mcq',
      creator_id: instructorId,
    });
    if (insErr) throw new Error(`catalog insert failed: ${insErr.message}`);
    console.log(`  Created catalog "${quizConfig.name}" (${activityType}).`);
  } else {
    console.log(`  Catalog "${existingCatalog.quiz_name}" already exists (${activityType}).`);
  }

  const byLevel = await loadExistingQuestions(supabase, activityType);
  for (const level of quizConfig.levels) {
    const have = byLevel[level].length;
    const need = QUESTIONS_PER_LEVEL - have;
    if (need <= 0) continue;
    const prompts = QUESTION_BANK[level].slice(have, have + need);
    const created = await createQuestionsBatch(supabase, activityType, level, prompts, instructorId, have);
    byLevel[level].push(...created);
  }
  console.log(`  Questions (levels ${quizConfig.levels.join(',')}): ${quizConfig.levels.map((l) => `L${l}=${byLevel[l].length}`).join(', ')}.`);
  return byLevel;
}

async function ensureAssembledQuiz(supabase, quizName, courseId, activityType, instructorId) {
  const { data: existing, error: selErr } = await supabase
    .from('assembled_quiz')
    .select('assembled_quiz_id, quiz_name')
    .eq('course_id', courseId)
    .eq('quiz_name', quizName)
    .maybeSingle();
  if (selErr) throw new Error(`assembled_quiz lookup failed: ${selErr.message}`);

  let assembledQuizId;
  if (existing) {
    assembledQuizId = existing.assembled_quiz_id;
    console.log(`  Assembled quiz "${existing.quiz_name}" already exists.`);
  } else {
    const { data, error } = await supabase
      .from('assembled_quiz')
      .insert({
        assembled_quiz_id: crypto.randomUUID(),
        quiz_name: quizName,
        description: 'Load-test seed data (GitHub #275).',
        course_id: courseId,
        creator_id: instructorId,
        grading_kind: 'mcq',
        questions_per_level: QUESTIONS_PER_LEVEL,
      })
      .select('assembled_quiz_id, quiz_name')
      .single();
    if (error) throw new Error(`assembled_quiz insert failed: ${error.message}`);
    assembledQuizId = data.assembled_quiz_id;
    console.log(`  Created assembled quiz "${data.quiz_name}", granting the course access to the catalog.`);
  }

  const { data: existingLink } = await supabase
    .from('assembled_quiz_catalog')
    .select('assembled_quiz_catalog_id')
    .eq('assembled_quiz_id', assembledQuizId)
    .eq('activity_type', activityType)
    .maybeSingle();
  if (!existingLink) {
    const { error } = await supabase.from('assembled_quiz_catalog').insert({ assembled_quiz_id: assembledQuizId, activity_type: activityType });
    if (error && error.code !== '23505') throw new Error(`assembled_quiz_catalog insert failed: ${error.message}`);
  }

  return assembledQuizId;
}

async function ensureEnrollments(supabase, courseId, students) {
  const studentIds = students.map((s) => s.userId);
  const existing = new Set();
  for (const batch of chunk(studentIds, 300)) {
    const { data, error } = await supabase.from('student_course').select('user_id').eq('course_id', courseId).in('user_id', batch);
    if (error) throw new Error(`student_course lookup failed: ${error.message}`);
    for (const row of data) existing.add(row.user_id);
  }

  const missing = students.filter((s) => !existing.has(s.userId));
  const rows = missing.map((s) => ({ user_id: s.userId, course_id: courseId }));
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from('student_course').insert(batch);
    if (error) throw new Error(`student_course insert failed: ${error.message}`);
  }
  console.log(`  Enrollments: ${missing.length} created, ${existing.size} already existed.`);
}

/** Builds the 4 session_to_question rows + this session's answered_question_log rows for one
 * session, marking exactly `correctCount` of the 4 questions correct (random which ones). */
function buildSessionQuestionRows(sessionId, pool, levelPoints, correctCount, timestamp) {
  const positions = shuffle([0, 1, 2, 3]);
  const correctSlots = new Set(shuffle([0, 1, 2, 3]).slice(0, correctCount));
  const sessionToQuestionRows = [];
  const answeredRows = [];

  pool.forEach((question, idx) => {
    sessionToQuestionRows.push({ session_id: sessionId, question_id: question.questionId, position: positions[idx] });
    const isCorrect = correctSlots.has(idx);
    answeredRows.push({
      log_id: crypto.randomUUID(),
      submitted_at: timestamp,
      score: isCorrect ? levelPoints : 0,
      session_id: sessionId,
      question_id: question.questionId,
      submitted_option: isCorrect ? question.correctAnswerId : question.wrongAnswerId,
    });
  });

  return { sessionToQuestionRows, answeredRows };
}

/**
 * Follow-up AC: every (student, quiz) pair independently lands in one of RESULT_GROUPS, ~25%
 * each — shuffle-then-modulo gives an exactly even split (e.g. 150/4 -> 38/38/37/37) and a
 * different shuffle per quiz, so the same student's group varies quiz to quiz ("Ergebnisse pro
 * Student und Quiz können variieren"). 'notStarted' students are simply skipped — no session_log
 * row at all, which is what makes them show up as "not attempted" everywhere that reads it.
 */
async function ensureActivityData(supabase, activityType, questionsByLevel, students) {
  const studentIds = students.map((s) => s.userId);
  const alreadySeeded = new Set();
  for (const batch of chunk(studentIds, 300)) {
    const { data, error } = await supabase.from('session_log').select('user_id').eq('activity_type', activityType).in('user_id', batch);
    if (error) throw new Error(`session_log lookup failed: ${error.message}`);
    for (const row of data) alreadySeeded.add(row.user_id);
  }

  const toSeed = students.filter((s) => !alreadySeeded.has(s.userId));
  if (toSeed.length === 0) {
    console.log(`  Activity data: already seeded for all ${students.length} students.`);
    return;
  }

  const availableLevels = Object.keys(questionsByLevel)
    .map(Number)
    .filter((level) => questionsByLevel[level].length > 0);

  const sessionRows = [];
  const sessionToQuestionRows = [];
  const answeredRows = [];
  const groupCounts = Object.fromEntries(RESULT_GROUPS.map((g) => [g.key, 0]));

  shuffle(toSeed).forEach((student, idx) => {
    const group = RESULT_GROUPS[idx % RESULT_GROUPS.length];
    groupCounts[group.key]++;
    if (group.correctFraction === null) return; // 'notStarted' — no session_log row at all

    const level = pickLevel(availableLevels);
    const pool = questionsByLevel[level];
    const levelPoints = MCQ_POINTS_BY_DIFFICULTY[level];
    const maxScore = QUESTIONS_PER_LEVEL * levelPoints;
    const correctCount = Math.round(QUESTIONS_PER_LEVEL * group.correctFraction);
    const sessionId = crypto.randomUUID();
    const [startedAt, endedAt] = [randomTimestampWithinDays(60), randomTimestampWithinDays(60)].sort();

    sessionRows.push({
      session_id: sessionId,
      user_id: student.userId,
      activity_type: activityType,
      difficulty_level: level,
      started_at: startedAt,
      ended_at: endedAt,
      status: 'completed',
      cumulative_score: 0, // trg_answered_question_log_score rolls this up as the answers below are inserted
      max_score: maxScore,
      passed: correctCount >= Math.ceil(QUESTIONS_PER_LEVEL * PASS_RATIO),
    });

    const { sessionToQuestionRows: stq, answeredRows: ans } = buildSessionQuestionRows(sessionId, pool, levelPoints, correctCount, endedAt);
    sessionToQuestionRows.push(...stq);
    answeredRows.push(...ans);
  });

  for (const batch of chunk(sessionRows, 500)) {
    const { error } = await supabase.from('session_log').insert(batch);
    if (error) throw new Error(`session_log insert failed: ${error.message}`);
  }
  for (const batch of chunk(sessionToQuestionRows, 800)) {
    const { error } = await supabase.from('session_to_question').insert(batch);
    if (error) throw new Error(`session_to_question insert failed: ${error.message}`);
  }
  for (const batch of chunk(answeredRows, 800)) {
    const { error } = await supabase.from('answered_question_log').insert(batch);
    if (error) throw new Error(`answered_question_log insert failed: ${error.message}`);
  }

  const groupSummary = RESULT_GROUPS.map((g) => `${g.label}=${groupCounts[g.key]}`).join(', ');
  console.log(`  Activity data: ${sessionRows.length} sessions for ${toSeed.length} students (${groupSummary}).`);
}

async function main() {
  const startedAt = Date.now();
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local');
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const totalStudents = COURSES.length * STUDENTS_PER_COURSE;
  console.log(`Seeding load-test data against ${url}`);
  console.log(`Plan: ${COURSES.length} instructors, ${COURSES.length} courses, ${totalStudents} students.\n`);

  // ---- 1. Resolve/create every auth user (instructors + students) ----
  const plannedAccounts = [];
  for (const course of COURSES) {
    plannedAccounts.push({ ...course.instructor, role: 'instructor' });
    for (let i = 1; i <= STUDENTS_PER_COURSE; i++) {
      plannedAccounts.push({
        email: studentEmail(course.studentEmailPrefix, i),
        firstName: 'TestStudent',
        lastName: `${course.key}${String(i).padStart(3, '0')}`,
        username: `teststudent_${course.key.toLowerCase()}${String(i).padStart(3, '0')}`,
        role: 'student',
      });
    }
  }

  const existingTestUsers = await listAllTestUsers(supabase);
  let createdAuthCount = 0;
  await mapLimit(plannedAccounts, 10, async (account) => {
    const existing = existingTestUsers.get(account.email.toLowerCase());
    if (existing) {
      account.userId = existing.id;
      return;
    }
    const { data, error } = await withRetry(() =>
      supabase.auth.admin.createUser({
        email: account.email,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { role: account.role },
      }),
    );
    if (error) throw new Error(`createUser(${account.email}) failed: ${error.message}`);
    account.userId = data.user.id;
    createdAuthCount++;
  });
  console.log(`Auth accounts: ${createdAuthCount} created, ${plannedAccounts.length - createdAuthCount} already existed.`);

  // ---- 2. Ensure "user" profile rows ----
  const allIds = plannedAccounts.map((a) => a.userId);
  const existingProfileIds = await selectExistingIds(supabase, 'user', 'user_id', allIds);
  const missingProfiles = plannedAccounts.filter((a) => !existingProfileIds.has(a.userId));
  if (missingProfiles.length > 0) {
    const rows = missingProfiles.map((a) => ({
      user_id: a.userId,
      username: a.username,
      biography: '',
      role: a.role,
      first_name: a.firstName,
      last_name: a.lastName,
    }));
    for (const batch of chunk(rows, 500)) {
      const { error } = await supabase.from('user').insert(batch);
      if (error) throw new Error(`profile insert failed: ${error.message}`);
    }
  }
  console.log(`Profiles: ${missingProfiles.length} created, ${existingProfileIds.size} already existed.`);

  const byEmail = new Map(plannedAccounts.map((a) => [a.email, a]));

  // ---- 3. Per course: course row, enrollments, then per quiz: catalog + questions, assembled
  // quiz, activity data ----
  for (const course of COURSES) {
    console.log(`\n--- ${course.courseName} (${course.courseCode}) ---`);
    const instructor = byEmail.get(course.instructor.email);

    const courseRow = await ensureCourse(supabase, course, instructor.userId);

    const students = [];
    for (let i = 1; i <= STUDENTS_PER_COURSE; i++) {
      students.push(byEmail.get(studentEmail(course.studentEmailPrefix, i)));
    }
    await ensureEnrollments(supabase, courseRow.course_id, students);

    for (const quizConfig of course.quizzes) {
      console.log(`  · ${quizConfig.name}`);
      const activityType = slugifyQuizName(quizConfig.name);
      const questionsByLevel = await ensureCatalogAndQuestions(supabase, quizConfig, activityType, instructor.userId);
      await ensureAssembledQuiz(supabase, `${quizConfig.name} Quiz`, courseRow.course_id, activityType, instructor.userId);
      await ensureActivityData(supabase, activityType, questionsByLevel, students);
    }
  }

  // ---- 4. Print + save login credentials (AC: one instructor + one student per course) ----
  const credentialLines = ['Requirements Coach — Load Test Credentials (GitHub #275)', `Generated: ${new Date().toISOString()}`, ''];
  for (const course of COURSES) {
    const sampleStudentEmail = studentEmail(course.studentEmailPrefix, 1);
    credentialLines.push(
      `${course.courseName} (code ${course.courseCode})`,
      `  Instructor — email: ${course.instructor.email}  password: ${TEST_PASSWORD}`,
      `  Student    — email: ${sampleStudentEmail}  password: ${TEST_PASSWORD}`,
      '',
    );
  }
  credentialLines.push(
    `All ${plannedAccounts.length} test accounts share the password above.`,
    `Student email pattern: <prefix><001-${String(STUDENTS_PER_COURSE).padStart(3, '0')}>@test.local, e.g. ${studentEmail(COURSES[0].studentEmailPrefix, 1)}.`,
    'Remove everything with: node scripts/cleanup-load-test.js --confirm',
  );
  const credentialsText = credentialLines.join('\n') + '\n';
  fs.writeFileSync(path.join(__dirname, '..', 'test-credentials.txt'), credentialsText);
  console.log('\n' + credentialsText);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s. Credentials written to test-credentials.txt.`);
}

main().catch((err) => {
  console.error('\nSeed script failed:', err);
  process.exit(1);
});
