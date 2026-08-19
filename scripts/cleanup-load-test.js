'use strict';

// Undoes scripts/seed-load-test.js. Finds everything to remove the same way the seed script
// finds what already exists — by the three deterministic anchors documented in
// loadTestConfig.js's header (the @test.local email suffix, the fixed course codes, and the
// catalogs' derived activity_type keys) — never a stored "is test data" flag, since none exists.
//
// Deletes in FK-safe order (children before the parents that RESTRICT their deletion; tables with
// ON DELETE CASCADE are left for Postgres to clear automatically — see the comment at each step):
//   1. session_log for every test student   -> cascades answered_question_log, session_to_question, submission
//   2. the 3 test courses                    -> cascades student_course, assembled_quiz (+ its own cascades,
//                                                which covers every quiz linked to a test course, not just one)
//   3. question_to_answer, answer, question for every test catalog (no cascade from activity_type)
//   4. every test catalog (activity_type) — COURSES[].quizzes.length per course, not just one
//   5. every @test.local auth user           -> cascades its "user" profile row
//
// Dry-run by default — pass --confirm (or --yes) to actually delete anything.
//
// Run: node scripts/cleanup-load-test.js --confirm  (or `npm run cleanup:load-test -- --confirm`)

const { createClient } = require('@supabase/supabase-js');
const { COURSES, slugifyQuizName, loadEnv, chunk, mapLimit, listAllTestUsers } = require('./loadTestConfig');

async function main() {
  const startedAt = Date.now();
  const confirmed = process.argv.slice(2).some((arg) => arg === '--confirm' || arg === '--yes');

  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local');
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log(`${confirmed ? 'Cleaning up' : 'DRY RUN — would clean up'} load-test data on ${url}\n`);

  // ---- Discover what exists ----
  const testUsers = await listAllTestUsers(supabase);
  const testUserIds = [...testUsers.values()].map((u) => u.id);
  console.log(`Found ${testUserIds.length} @test.local auth accounts.`);

  const courseCodes = COURSES.map((c) => c.courseCode);
  const { data: courseRows, error: courseErr } = await supabase.from('course').select('course_id, course_name, course_code').in('course_code', courseCodes);
  if (courseErr) throw new Error(`course lookup failed: ${courseErr.message}`);
  console.log(`Found ${courseRows.length} test course(s): ${courseRows.map((c) => c.course_name).join(', ') || '(none)'}.`);

  const activityTypes = COURSES.flatMap((c) => c.quizzes.map((q) => slugifyQuizName(q.name)));
  const { data: questionRows, error: qErr } = await supabase.from('question').select('question_id').in('activity_type', activityTypes);
  if (qErr) throw new Error(`question lookup failed: ${qErr.message}`);
  console.log(`Found ${questionRows.length} questions across ${activityTypes.length} test catalogs.`);

  if (!confirmed) {
    console.log('\nNothing deleted. Re-run with --confirm to actually remove the rows above.');
    return;
  }

  // ---- 1. session_log for every test user (cascades answered_question_log/session_to_question/submission) ----
  let deletedSessions = 0;
  for (const batch of chunk(testUserIds, 200)) {
    if (batch.length === 0) continue;
    const { data, error } = await supabase.from('session_log').delete().in('user_id', batch).select('session_id');
    if (error) throw new Error(`session_log delete failed: ${error.message}`);
    deletedSessions += data.length;
  }
  console.log(`\nDeleted ${deletedSessions} sessions (cascaded their answers/submissions).`);

  // ---- 2. the test courses (cascades student_course, assembled_quiz + its own children) ----
  const courseIds = courseRows.map((c) => c.course_id);
  if (courseIds.length > 0) {
    const { data, error } = await supabase.from('course').delete().in('course_id', courseIds).select('course_id');
    if (error) throw new Error(`course delete failed: ${error.message}`);
    console.log(`Deleted ${data.length} courses (cascaded enrollments/assembled quizzes).`);
  }

  // ---- 3. question/answer/question_to_answer for the test catalogs (no cascade from activity_type) ----
  const questionIds = questionRows.map((q) => q.question_id);
  const answerIds = [];
  for (const batch of chunk(questionIds, 300)) {
    if (batch.length === 0) continue;
    const { data, error } = await supabase.from('question_to_answer').select('answer_id').in('question_id', batch);
    if (error) throw new Error(`question_to_answer lookup failed: ${error.message}`);
    answerIds.push(...data.map((r) => r.answer_id));
  }
  for (const batch of chunk(questionIds, 300)) {
    if (batch.length === 0) continue;
    const { error } = await supabase.from('question_to_answer').delete().in('question_id', batch);
    if (error) throw new Error(`question_to_answer delete failed: ${error.message}`);
  }
  for (const batch of chunk(answerIds, 300)) {
    if (batch.length === 0) continue;
    const { error } = await supabase.from('answer').delete().in('answer_id', batch);
    if (error) throw new Error(`answer delete failed: ${error.message}`);
  }
  for (const batch of chunk(questionIds, 300)) {
    if (batch.length === 0) continue;
    const { error } = await supabase.from('question').delete().in('question_id', batch);
    if (error) throw new Error(`question delete failed: ${error.message}`);
  }
  console.log(`Deleted ${questionIds.length} questions and ${answerIds.length} answers.`);

  // ---- 4. the test catalogs themselves ----
  const { data: deletedCatalogs, error: catDelErr } = await supabase.from('activity_type').delete().in('activity_type', activityTypes).select('activity_type');
  if (catDelErr) throw new Error(`activity_type delete failed: ${catDelErr.message}`);
  console.log(`Deleted ${deletedCatalogs.length} catalogs.`);

  // ---- 5. every @test.local auth user (cascades its "user" profile row via fk_user_auth_users) ----
  let deletedUsers = 0;
  await mapLimit(testUserIds, 10, async (id) => {
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error && !/not.*found/i.test(error.message || '')) {
      throw new Error(`deleteUser(${id}) failed: ${error.message}`);
    }
    deletedUsers++;
  });
  console.log(`Deleted ${deletedUsers} auth accounts (profiles cascaded).`);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nCleanup done in ${elapsed}s.`);
}

main().catch((err) => {
  console.error('\nCleanup script failed:', err);
  process.exit(1);
});
