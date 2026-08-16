-- =====================================================================
-- Requirements Coach — database schema
--
-- Run this in your Supabase SQL editor, then supabase/seed.sql for the
-- question bank. The script assumes a fresh database; see "Migration
-- notes" at the bottom for coming from the starter template
-- (myapp_profile) or for re-running it.
--
-- Conventions: snake_case throughout.
--   fk_<table_with_the_fk>_<referenced_table>
--   uq_ / ck_ / ix_ / trg_ for unique, check, index, trigger.
--
-- Create a public storage bucket for avatar images as well:
-- Supabase dashboard → Storage → New bucket → name "avatars" → Public.
-- =====================================================================


-- =====================================================================
-- Core tables
-- =====================================================================

-- "user" has to stay quoted everywhere: USER is a reserved word in
-- Postgres. In supabase-js the plain form is fine — .from('user') —
-- PostgREST quotes identifiers itself.
CREATE TABLE "user" (
    user_id uuid NOT NULL,
    username text NOT NULL,
    biography text NOT NULL,
    avatar_url text,
    role text NOT NULL DEFAULT 'student',
    -- Issue #61: optional profile fields, filled in on the profile page
    -- after account creation. All nullable — a user_id with a username
    -- is still a valid row without these.
    first_name text NOT NULL,
    last_name text NOT NULL,
    age int2 CHECK (age IS NULL OR (age > 0 AND age < 130)),
    semester int2 CHECK (semester IS NULL OR (semester > 0 AND semester <= 20)),
    -- GitHub #318: has the first-login guided tour been shown (finished or skipped) yet? Not
    -- role-specific — which step list to play is decided client-side from role, this column
    -- only tracks "has this account seen some tour already". Defaults false so an existing
    -- account backfilled by the ALTER TABLE below is treated the same as a brand new one: they
    -- get the tour once, same as everybody else.
    has_seen_onboarding_tour bool NOT NULL DEFAULT false,
    PRIMARY KEY (user_id));

-- ---------------------------------------------------------------------
-- GitHub #122/#347: Activity Type
--
-- A lookup table for the activity_type values every other table already
-- stores as free text (question, session_log, title_definition). The
-- natural key (the string itself) is the primary key, not a surrogate id,
-- so turning an existing activity_type column into a foreign key later
-- needed no data migration — just an ALTER TABLE ADD CONSTRAINT (GitHub
-- #123).
--
-- GitHub #347 turned this from a fixed lookup of three built-in quizzes
-- into a real, creatable record: quiz_name is the display name (the three
-- built-in rows backfill it from lib/activityContent.ts's ACTIVITIES[].name
-- — see the migration note near the bottom of this file), description is
-- optional instructor-written context, and creator_id is nullable —
-- NULL means "Built-in" (true for all three original rows), a real value
-- means the instructor who created that quiz via POST /api/activities/types.
-- No ON DELETE clause on creator_id, same reasoning as fk_question_user
-- below: a deleted instructor account should not silently orphan or
-- cascade-delete the quiz (and everything built on it — questions,
-- sessions, titles) they created.
-- ---------------------------------------------------------------------
CREATE TABLE activity_type (
    activity_type varchar(50) NOT NULL,
    quiz_name     text        NOT NULL,
    description   text,
    creator_id    uuid,
    PRIMARY KEY (activity_type));

-- ---------------------------------------------------------------------
-- REQ-DL-1: Question Bank
-- ---------------------------------------------------------------------
CREATE TABLE question (
    question_id uuid NOT NULL,
    question_prompt text NOT NULL,
    difficulty_level int2 NOT NULL,
    activity_type varchar(50) NOT NULL,
    order_number int4 NOT NULL,
    max_score int4,
    -- GitHub #201: the instructor who created the question, so #116 can scope "my quiz's
    -- questions" to one professor. Nullable — the seeded question bank (supabase/seed.sql) has
    -- no real "user" row to point at when it runs, and a question without a specific creator is
    -- a legitimate state, not a data error.
    user_id uuid,
    PRIMARY KEY (question_id));

-- ---------------------------------------------------------------------
-- REQ-DL-2: Answer Bank
-- ---------------------------------------------------------------------
CREATE TABLE answer (
    answer_id uuid NOT NULL,
    option_text text NOT NULL,
    explanation text,
    is_correct bool NOT NULL,
    PRIMARY KEY (answer_id));

CREATE TABLE question_to_answer (
    question_to_answer_id SERIAL NOT NULL,
    question_id uuid NOT NULL,
    answer_id uuid NOT NULL,
    PRIMARY KEY (question_to_answer_id));

CREATE TABLE badge (
    badge_id uuid NOT NULL,
    badge_name text NOT NULL,
    badge_image_uri text,
    PRIMARY KEY (badge_id));

-- ---------------------------------------------------------------------
-- User Story Bank
--
-- Dedicated table for the User Story bank, so a random story can be
-- served to students without overloading the MCQ-shaped question/
-- answer tables above.
-- ---------------------------------------------------------------------
CREATE TABLE user_story (
    user_story_id    uuid        NOT NULL,
    story_text       text        NOT NULL,
    difficulty_level int2        NOT NULL,
    activity_type    varchar(50) NOT NULL,
    -- Nullable for the same reason as question.user_id (GitHub #201): the seeded starter set
    -- (GitHub #133) runs when there is no real "user" row yet to attribute authorship to.
    -- NULL means "no specific creator" — the seeded bank, not a data error.
    creator_id       uuid,
    PRIMARY KEY (user_story_id));

-- ---------------------------------------------------------------------
-- Submission Bank
--
-- A student's free-text answer to a user_story prompt (REQ-FU-1 /
-- REQ-FU-2), plus its LLM grading result. Nullable llm_* / graded_at:
-- the row is inserted at submit time before grading runs, then a
-- service-role grading step fills them in afterward ("write before
-- disclose", same as answered_question_log).
--
-- session_id ties a submission to the practice session it was made in (which of the 4
-- session_to_user_story rows it answers), the same relationship answered_question_log has to
-- session_log/session_to_question — POST .../write-acceptance-criteria/submissions now requires
-- and populates it, mirroring the Type A answers route exactly (lib/acceptanceCriteriaQueries.ts).
-- Still nullable: rows submitted before this wiring landed have no session to point at, and
-- nothing forces every future submission through this column at the database level, only the
-- route layer. Once a session_id is set, uq_submission_session_user_story below stops a second
-- submission for the same story in the same session from being anything other than rejected: the
-- original is kept, never overwritten. The next story to work on is derived the same way
-- nextUnansweredPosition derives the next question — the lowest session_to_user_story.position
-- with no matching submission — not stored as an index anywhere.
-- ---------------------------------------------------------------------
CREATE TABLE submission (
    submission_id  uuid        NOT NULL,
    user_id        uuid        NOT NULL,
    user_story_id  uuid        NOT NULL,
    session_id     uuid,
    submitted_text text        NOT NULL,
    llm_score      int4,
    llm_feedback   text,
    llm_provider   text,
    submitted_at   timestamp   NOT NULL DEFAULT now(),
    graded_at      timestamp,
    PRIMARY KEY (submission_id));

-- ---------------------------------------------------------------------
-- Instructor LLM Config
--
-- Stores the LLM provider + model + API key an instructor has configured for
-- grading free-text submissions (submission.llm_provider). RLS-enabled
-- with no client policies, same as question/answer/user_story — only a
-- service-role route can read or write api_key, and that route is
-- responsible for masking it before it reaches the client.
-- ---------------------------------------------------------------------
CREATE TABLE instructor_llm_config (
    instructor_llm_config_id uuid      NOT NULL,
    user_id                  uuid      NOT NULL,
    provider                 text      NOT NULL,
    model                    text      NOT NULL,
    api_key                  text      NOT NULL,
    is_active                bool      NOT NULL DEFAULT false,
    updated_at               timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY (instructor_llm_config_id));

-- ---------------------------------------------------------------------
-- REQ-GAM-DL-2: Title Definition Storage
--
-- Maps (activity_type, difficulty_level) to a title name (e.g. "Story
-- Apprentice"). A student's current title is derived at query time
-- (REQ-GAM-BL-1) by looking up the highest passed difficulty_level per
-- activity_type here — nothing about a title is stored on the student.
-- ---------------------------------------------------------------------
CREATE TABLE title_definition (
    title_definition_id uuid        NOT NULL,
    activity_type        varchar(50) NOT NULL,
    difficulty_level      int2        NOT NULL,
    title_name            text        NOT NULL,
    PRIMARY KEY (title_definition_id));

CREATE TABLE user_badge (
    user_badge_id uuid NOT NULL,
    created_at timestamp NOT NULL,
    user_id uuid NOT NULL,
    badge_id uuid NOT NULL,
    PRIMARY KEY (user_badge_id));

-- ---------------------------------------------------------------------
-- REQ-DL-5: Course Enrollment Storage
--
-- A course belongs to one instructor (creator_id, named like
-- user_story.creator_id). Students normally self-enroll with a
-- course-specific code (course.course_code) rather than the class_code
-- table from REQ-DL-3.4.1/3.4.2 — that code is entered once at account
-- registration, whereas course_code is used per-course, after the
-- student already has an account, and a student may join more than one
-- course. course_code is nullable: a codeless course has no self-serve
-- join path, e.g. an instructor assigning it directly to every student
-- (student_course rows inserted by the instructor's own action) instead
-- of students opting in themselves. student_course is the link table —
-- a SERIAL surrogate id, like question_to_answer / session_to_question,
-- since nothing else needs to reference an individual enrollment row by
-- id.
-- ---------------------------------------------------------------------
CREATE TABLE course (
    course_id   uuid      NOT NULL,
    creator_id  uuid      NOT NULL,
    course_name text      NOT NULL,
    course_code text,
    created_at  timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id));

CREATE TABLE student_course (
    student_course_id SERIAL    NOT NULL,
    user_id            uuid      NOT NULL,
    course_id          uuid      NOT NULL,
    enrolled_at        timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY (student_course_id));

-- ---------------------------------------------------------------------
-- GitHub #360: Assembled Quiz
--
-- Deliberately a separate concept from activity_type (the "Question
-- Catalog" a question belongs to, GitHub #347/#359, still internally
-- called "quiz" in code) — see CLAUDE.md for why the two aren't merged.
-- An assembled_quiz composes one or more catalogs for one course; it
-- has no question pool of its own, only references. Questions are
-- drawn dynamically per attempt from the pool of its catalogs'
-- questions at the requested level (lib/assembledQuizQueries.ts's
-- pickRandomQuestionsForLevel), the same "draw fresh each time" model
-- Type A activities already use — not materialized here, so the draw
-- always reflects whatever the referenced catalogs currently contain.
--
-- course_id is NOT NULL: unlike activity_type (shared across every
-- instructor), an assembled_quiz exists FOR one course and has no
-- meaning without it — ON DELETE CASCADE below matches that. The
-- existing difficulty-level scheme (1-3) is reused as-is; no new level
-- column or table.
-- ---------------------------------------------------------------------
CREATE TABLE assembled_quiz (
    assembled_quiz_id uuid      NOT NULL,
    quiz_name         text      NOT NULL,
    description       text,
    course_id         uuid      NOT NULL,
    creator_id        uuid      NOT NULL,
    created_at        timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY (assembled_quiz_id));

-- The m:n link to the catalogs (activity_type rows) a quiz draws from.
-- A SERIAL surrogate id, like question_to_answer / session_to_question,
-- since nothing else needs to reference an individual link row by id.
CREATE TABLE assembled_quiz_catalog (
    assembled_quiz_catalog_id SERIAL      NOT NULL,
    assembled_quiz_id         uuid        NOT NULL,
    activity_type             varchar(50) NOT NULL,
    PRIMARY KEY (assembled_quiz_catalog_id));

-- ---------------------------------------------------------------------
-- Activity-Course link
--
-- Ties every activity_type (built-in or instructor-created) to exactly one course: an
-- instructor creating an activity must choose a course they own, and a student can only see
-- and play an activity whose course they're enrolled in (student_course intersection, same
-- mechanism GET /api/courses/{id}/leaderboard and GET /api/students/{id}/public-profile use
-- via isEnrolledInAnyCourse). A real join table, not a course_id column on activity_type
-- itself, so the relationship reads and drops the same way every other course link in this
-- schema does (student_course, assembled_quiz) — uq_activity_type_course_activity_type below
-- is what actually enforces "exactly one," not the table shape.
--
-- The three built-in activity_type rows (supabase/seed.sql) have no row here until an
-- instructor links each one to a course — until then they simply aren't visible to any
-- student, the same as a freshly created catalog with no course yet. That's a consequence of
-- the enrollment filter, not a special case: an activity_type with no matching row here is
-- just as "not available" as one linked to a course nobody in the query is enrolled in.
--
-- ON DELETE CASCADE on course_id (not on activity_type) matches fk_assembled_quiz_course: a
-- link has no meaning once its course is gone, but the activity_type row, its questions, and
-- every session/title/score built on it must survive the course's deletion the same way they
-- already survive an assembled_quiz's course being deleted (see CLAUDE.md's Courses section) —
-- the activity just becomes unlinked (and so, again, simply not visible) until relinked.
-- ---------------------------------------------------------------------
CREATE TABLE activity_type_course (
    activity_type_course_id SERIAL      NOT NULL,
    activity_type            varchar(50) NOT NULL,
    course_id                uuid        NOT NULL,
    created_at                timestamp  NOT NULL DEFAULT now(),
    PRIMARY KEY (activity_type_course_id));
-- GitHub #361: Quiz Excluded Question
--
-- "Displayed as copies of the originals" (the issue's own user story) is implemented as an
-- exclusion list, not a duplication: a quiz still references the ORIGINAL catalogs via
-- assembled_quiz_catalog above, and this table only records which of those catalogs' questions
-- this one quiz should skip when drawing a round (lib/assembledQuizQueries.ts). The original
-- question row is never touched — excluding it for one quiz is invisible to every other quiz,
-- to the catalog's own detail page (GitHub #359), and to any student already working through
-- that catalog directly. This avoids the alternative (cloning question/answer rows per quiz),
-- which would need its own sync story the moment the original catalog changes.
--
-- Both FKs cascade: a quiz_excluded_question row means nothing once either the quiz or the
-- question it names is gone. This is a deliberately different cascade choice from
-- question_to_answer/answered_question_log's *lack* of one — those protect a student's answer
-- history from disappearing silently; an instructor's own "skip this question" preference has no
-- such history to protect.
-- ---------------------------------------------------------------------
CREATE TABLE quiz_excluded_question (
    quiz_excluded_question_id SERIAL NOT NULL,
    assembled_quiz_id         uuid   NOT NULL,
    question_id                uuid   NOT NULL,
    PRIMARY KEY (quiz_excluded_question_id));


-- =====================================================================
-- REQ-DL-3 / REQ-PL-2.1: Session Log
--
-- Extended beyond started_at / ended_at / score so AC 2 of the session
-- issue is satisfiable: difficulty_level, status, cumulative_score,
-- max_score and passed are all required on the session record.
--
-- No current_question_index column on purpose: a mutable pointer would
-- be the only place with real merge conflicts across devices. The next
-- question is derived as the first position in session_to_question
-- without a matching row in answered_question_log.
-- =====================================================================

CREATE TABLE session_log (
    session_id       uuid        NOT NULL,
    user_id          uuid        NOT NULL,
    activity_type    varchar(50) NOT NULL,
    difficulty_level int2        NOT NULL DEFAULT 1,
    started_at       timestamp   NOT NULL DEFAULT now(),
    ended_at         timestamp,
    status           varchar(20) NOT NULL DEFAULT 'in-progress',
    cumulative_score int4        NOT NULL DEFAULT 0,
    max_score        int4        NOT NULL DEFAULT 100,
    passed           bool        NOT NULL DEFAULT false,
    badge_id         uuid,
    PRIMARY KEY (session_id));

-- The 4 drawn questions, analogous to question_to_answer.
-- position is the presentation order (0..3).
CREATE TABLE session_to_question (
    session_to_question_id SERIAL NOT NULL,
    session_id             uuid   NOT NULL,
    question_id            uuid   NOT NULL,
    position               int4   NOT NULL,
    PRIMARY KEY (session_to_question_id));

-- ---------------------------------------------------------------------
-- The 4 drawn user stories for a practice session, same shape and
-- reasoning as session_to_question above: draw once at session start,
-- persist the set and its order (position, 0..3) so a resumed session
-- shows the same 4 stories in the same order rather than drawing again.
-- Written by POST /api/activities/write-acceptance-criteria/sessions and read by
-- lib/acceptanceCriteriaQueries.ts's loadSessionStories, the same role session_to_question plays
-- for Type A — see that route and lib/acceptanceCriteriaQueries.ts.
-- ---------------------------------------------------------------------
CREATE TABLE session_to_user_story (
    session_to_user_story_id SERIAL NOT NULL,
    session_id               uuid   NOT NULL,
    user_story_id            uuid   NOT NULL,
    position                 int4   NOT NULL,
    PRIMARY KEY (session_to_user_story_id));


-- ---------------------------------------------------------------------
-- REQ-DL-4: Answered Question Log
--
-- Tracks the score achieved for a specific submission (score), and the
-- session it belongs to (session_id) so a resumed activity can tell
-- which of the 4 questions are already done.
-- user_id was removed (GitHub #93) — it is redundant because it can be
-- retrieved via a join on session_log, and keeping it in sync risked
-- inconsistency.
-- ---------------------------------------------------------------------
CREATE TABLE answered_question_log (
    log_id uuid NOT NULL,
    submitted_at timestamp NOT NULL DEFAULT now(),
    score int4 NOT NULL,
    session_id uuid NOT NULL,
    question_id uuid NOT NULL,
    submitted_option uuid NOT NULL,
    PRIMARY KEY (log_id));


-- ---------------------------------------------------------------------
-- GitHub #337: Daily Challenge
--
-- One random cross-course question a day, drawn from the courses the student is enrolled in
-- (course.creator_id -> question.user_id), with a server-enforced time limit and double points.
-- submitted_option/is_correct/score/submitted_at are nullable for the same write-before-disclose
-- reason as answered_question_log/submission: the row is inserted at draw time (locking in the
-- question and today's deadline), then filled in only if the student submits before deadline_at.
-- A missed deadline is left unfinalized on purpose — nothing outside this table reads it for
-- scoring, so an unfinalized row's only job is to keep uq_daily_challenge_attempt_user_date
-- blocking a second attempt that day, finished or not.
-- ---------------------------------------------------------------------
CREATE TABLE daily_challenge_attempt (
    daily_challenge_attempt_id uuid      NOT NULL,
    user_id                    uuid      NOT NULL,
    question_id                uuid      NOT NULL,
    challenge_date              date      NOT NULL,
    started_at                  timestamp NOT NULL DEFAULT now(),
    deadline_at                  timestamp NOT NULL,
    submitted_option             uuid,
    is_correct                   bool,
    score                        int4,
    submitted_at                 timestamp,
    PRIMARY KEY (daily_challenge_attempt_id));


-- =====================================================================
-- Foreign Keys
-- Naming pattern: fk_<table_with_the_fk>_<referenced_table>
-- =====================================================================

-- Ties the profile row to the Supabase auth account, so user_id equals
-- auth.uid() and deleting the account cleans up everything behind it.
ALTER TABLE "user" ADD CONSTRAINT fk_user_auth_users FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- GitHub #123: every activity_type column now points at the activity_type lookup table
-- from #122, instead of being free text (question, session_log) or a hardcoded CHECK
-- (title_definition, see the constraint removed below).
ALTER TABLE question ADD CONSTRAINT fk_question_activity_type FOREIGN KEY (activity_type) REFERENCES activity_type (activity_type);

-- GitHub #201: which instructor created the question. No ON DELETE clause on purpose — a
-- deleted instructor account should not silently orphan or cascade-delete their questions;
-- that decision is left for whoever eventually handles account deletion.
ALTER TABLE question ADD CONSTRAINT fk_question_user FOREIGN KEY (user_id) REFERENCES "user" (user_id);

-- GitHub #347: which instructor created this quiz — NULL (the three built-in quizzes) needs no
-- FK to satisfy. Same no-ON-DELETE reasoning as fk_question_user just above.
ALTER TABLE activity_type ADD CONSTRAINT fk_activity_type_user FOREIGN KEY (creator_id) REFERENCES "user" (user_id);

ALTER TABLE question_to_answer ADD CONSTRAINT fk_question_to_answer_question FOREIGN KEY (question_id) REFERENCES question (question_id);
ALTER TABLE question_to_answer ADD CONSTRAINT fk_question_to_answer_answer FOREIGN KEY (answer_id) REFERENCES answer (answer_id);

ALTER TABLE user_badge ADD CONSTRAINT fk_user_badge_user FOREIGN KEY (user_id) REFERENCES "user" (user_id);
ALTER TABLE user_badge ADD CONSTRAINT fk_user_badge_badge FOREIGN KEY (badge_id) REFERENCES badge (badge_id);

-- REQ-DL-5: course belongs to one instructor. No ON DELETE clause, same reasoning as
-- fk_question_user — a deleted instructor account should not silently cascade-delete courses.
ALTER TABLE course ADD CONSTRAINT fk_course_user FOREIGN KEY (creator_id) REFERENCES "user" (user_id);

ALTER TABLE student_course ADD CONSTRAINT fk_student_course_user FOREIGN KEY (user_id) REFERENCES "user" (user_id);
-- Deleting a course removes its enrollments too, unlike fk_course_user above — an enrollment
-- has no meaning once the course it points at is gone.
ALTER TABLE student_course ADD CONSTRAINT fk_student_course_course FOREIGN KEY (course_id) REFERENCES course (course_id) ON DELETE CASCADE;

-- GitHub #360: an assembled quiz has no meaning once the course it was composed for is gone,
-- same reasoning as fk_student_course_course just above.
ALTER TABLE assembled_quiz ADD CONSTRAINT fk_assembled_quiz_course FOREIGN KEY (course_id) REFERENCES course (course_id) ON DELETE CASCADE;
-- No ON DELETE clause, same reasoning as fk_course_user — a deleted instructor account should
-- not silently cascade-delete the quizzes they assembled.
ALTER TABLE assembled_quiz ADD CONSTRAINT fk_assembled_quiz_user FOREIGN KEY (creator_id) REFERENCES "user" (user_id);

ALTER TABLE assembled_quiz_catalog ADD CONSTRAINT fk_assembled_quiz_catalog_quiz FOREIGN KEY (assembled_quiz_id) REFERENCES assembled_quiz (assembled_quiz_id) ON DELETE CASCADE;
ALTER TABLE assembled_quiz_catalog ADD CONSTRAINT fk_assembled_quiz_catalog_activity_type FOREIGN KEY (activity_type) REFERENCES activity_type (activity_type);

-- No ON DELETE clause, same reasoning as fk_question_activity_type/fk_session_log_activity_type
-- — deleting an activity_type is not a supported operation today, so there is nothing to cascade.
ALTER TABLE activity_type_course ADD CONSTRAINT fk_activity_type_course_activity_type FOREIGN KEY (activity_type) REFERENCES activity_type (activity_type);
-- A link has no meaning once its course is gone, same reasoning as fk_assembled_quiz_course.
ALTER TABLE activity_type_course ADD CONSTRAINT fk_activity_type_course_course FOREIGN KEY (course_id) REFERENCES course (course_id) ON DELETE CASCADE;
-- GitHub #361: both cascade — see the quiz_excluded_question table comment above for why this
-- pair differs from question_to_answer/answered_question_log's lack of one.
ALTER TABLE quiz_excluded_question ADD CONSTRAINT fk_quiz_excluded_question_quiz FOREIGN KEY (assembled_quiz_id) REFERENCES assembled_quiz (assembled_quiz_id) ON DELETE CASCADE;
ALTER TABLE quiz_excluded_question ADD CONSTRAINT fk_quiz_excluded_question_question FOREIGN KEY (question_id) REFERENCES question (question_id) ON DELETE CASCADE;

ALTER TABLE title_definition ADD CONSTRAINT fk_title_definition_activity_type FOREIGN KEY (activity_type) REFERENCES activity_type (activity_type);
-- Who authored the story, for attribution/moderation.
ALTER TABLE user_story ADD CONSTRAINT fk_user_story_user FOREIGN KEY (creator_id) REFERENCES "user" (user_id);

ALTER TABLE submission ADD CONSTRAINT fk_submission_user FOREIGN KEY (user_id) REFERENCES "user" (user_id);
ALTER TABLE submission ADD CONSTRAINT fk_submission_user_story FOREIGN KEY (user_story_id) REFERENCES user_story (user_story_id);
-- ON DELETE CASCADE matches fk_answered_question_log_session — a submission has no meaning
-- once the session it was made in is gone.
ALTER TABLE submission ADD CONSTRAINT fk_submission_session FOREIGN KEY (session_id) REFERENCES session_log (session_id) ON DELETE CASCADE;

ALTER TABLE instructor_llm_config ADD CONSTRAINT fk_instructor_llm_config_user FOREIGN KEY (user_id) REFERENCES "user" (user_id);

ALTER TABLE answered_question_log ADD CONSTRAINT fk_answered_question_log_question FOREIGN KEY (question_id) REFERENCES question (question_id);
ALTER TABLE answered_question_log ADD CONSTRAINT fk_answered_question_log_answer FOREIGN KEY (submitted_option) REFERENCES answer (answer_id);
ALTER TABLE answered_question_log ADD CONSTRAINT fk_answered_question_log_session FOREIGN KEY (session_id) REFERENCES session_log (session_id) ON DELETE CASCADE;

ALTER TABLE session_log ADD CONSTRAINT fk_session_log_user FOREIGN KEY (user_id) REFERENCES "user" (user_id);
ALTER TABLE session_log ADD CONSTRAINT fk_session_log_badge FOREIGN KEY (badge_id) REFERENCES badge (badge_id);
ALTER TABLE session_log ADD CONSTRAINT fk_session_log_activity_type FOREIGN KEY (activity_type) REFERENCES activity_type (activity_type);

ALTER TABLE session_to_question ADD CONSTRAINT fk_session_to_question_session FOREIGN KEY (session_id) REFERENCES session_log (session_id) ON DELETE CASCADE;
ALTER TABLE session_to_question ADD CONSTRAINT fk_session_to_question_question FOREIGN KEY (question_id) REFERENCES question (question_id);

ALTER TABLE session_to_user_story ADD CONSTRAINT fk_session_to_user_story_session FOREIGN KEY (session_id) REFERENCES session_log (session_id) ON DELETE CASCADE;
ALTER TABLE session_to_user_story ADD CONSTRAINT fk_session_to_user_story_user_story FOREIGN KEY (user_story_id) REFERENCES user_story (user_story_id);

-- GitHub #337: no ON DELETE clause on the user/question FKs, matching fk_session_log_user and
-- fk_session_to_question_question — a deleted account or question should not silently cascade
-- away attempt history, and there is no parent session row to cascade from the way submission
-- cascades from session_log.
ALTER TABLE daily_challenge_attempt ADD CONSTRAINT fk_daily_challenge_attempt_user FOREIGN KEY (user_id) REFERENCES "user" (user_id);
ALTER TABLE daily_challenge_attempt ADD CONSTRAINT fk_daily_challenge_attempt_question FOREIGN KEY (question_id) REFERENCES question (question_id);
ALTER TABLE daily_challenge_attempt ADD CONSTRAINT fk_daily_challenge_attempt_answer FOREIGN KEY (submitted_option) REFERENCES answer (answer_id);


-- =====================================================================
-- Constraints and indexes
-- =====================================================================

ALTER TABLE question ADD CONSTRAINT ck_question_difficulty_level CHECK (difficulty_level BETWEEN 1 AND 3);

-- REQ-GAM-DL-2.1: one title per (activity_type, difficulty_level) pair so the BL-1 lookup is
-- unambiguous. activity_type itself is restricted to the known set via fk_title_definition_activity_type
-- above, not a CHECK here — a hardcoded list of literals would drift from the activity_type table.
ALTER TABLE user_story ADD CONSTRAINT ck_user_story_difficulty_level CHECK (difficulty_level BETWEEN 1 AND 3);

-- Mirrors ix_question_activity_type_difficulty: the draw for a random
-- story filters on exactly this pair.
CREATE INDEX ix_user_story_activity_type_difficulty ON user_story (activity_type, difficulty_level);

-- REQ-GAM-DL-2.1: activity type restricted to the known set, one title per
-- (activity_type, difficulty_level) pair so the BL-1 lookup is unambiguous.
ALTER TABLE title_definition ADD CONSTRAINT ck_title_definition_difficulty_level CHECK (difficulty_level BETWEEN 1 AND 3);
ALTER TABLE title_definition ADD CONSTRAINT uq_title_definition_activity_level UNIQUE (activity_type, difficulty_level);

ALTER TABLE session_log ADD CONSTRAINT ck_session_log_status CHECK (status IN ('in-progress', 'completed', 'abandoned'));
ALTER TABLE session_log ADD CONSTRAINT ck_session_log_difficulty_level CHECK (difficulty_level BETWEEN 1 AND 3);

-- GitHub #82: the only two roles the app understands. Set at profile-creation time from
-- auth.users.raw_user_meta_data.role (see app/api/profile/route.ts) — INSTRUCTOR_SIGNUP_CODE
-- is what gets a signup that metadata in the first place (app/api/auth/register/route.ts).
ALTER TABLE "user" ADD CONSTRAINT ck_user_role CHECK (role IN ('student', 'instructor'));

-- The draw for a new session filters on exactly this pair.
CREATE INDEX ix_question_activity_type_difficulty ON question (activity_type, difficulty_level);

-- The class-wide instructor reads (GitHub #171/#115) scan session_log across every student
-- instead of a single user_id, which the partial uq_session_log_one_active below cannot serve
-- (it only covers rows with status = 'in-progress').
--
-- ix_session_log_user_id backs the per-student routes and the joins onto answered_question_log;
-- ix_session_log_ended_at matches loadAllStudentActivity's ORDER BY exactly, both columns and
-- both directions, so the newest-first timeline needs no sort step.
CREATE INDEX ix_session_log_user_id ON session_log (user_id);
CREATE INDEX ix_session_log_ended_at ON session_log (ended_at DESC, started_at DESC);

-- loadAllStudentActivity/loadAllStudentSessions inner-join "user" filtered on role = 'student'
-- so instructors don't turn up in their own report.
CREATE INDEX ix_user_role ON "user" (role);

-- REQ-DL-5: a student's enrollment code lookup ("join this course") must resolve to exactly
-- one course, and a student cannot enroll in the same course twice. course_code is nullable
-- (codeless = instructor-assigned, no self-serve join) and Postgres UNIQUE treats every NULL
-- as distinct from every other NULL, so any number of codeless courses can coexist here.
ALTER TABLE course ADD CONSTRAINT uq_course_code UNIQUE (course_code);
ALTER TABLE student_course ADD CONSTRAINT uq_student_course_user_course UNIQUE (user_id, course_id);

-- An instructor's "my courses" list filters on exactly this column.
CREATE INDEX ix_course_creator_id ON course (creator_id);

-- GitHub #360: a quiz cannot reference the same catalog twice, and "every catalog this quiz
-- draws from" (the random-selection pool) filters on assembled_quiz_id.
ALTER TABLE assembled_quiz_catalog ADD CONSTRAINT uq_assembled_quiz_catalog UNIQUE (assembled_quiz_id, activity_type);
CREATE INDEX ix_assembled_quiz_catalog_quiz_id ON assembled_quiz_catalog (assembled_quiz_id);

-- An instructor's "my assembled quizzes" list filters on creator_id; a course's assigned
-- quizzes (not yet read by any route, but the natural next lookup) would filter on course_id.
CREATE INDEX ix_assembled_quiz_creator_id ON assembled_quiz (creator_id);
CREATE INDEX ix_assembled_quiz_course_id ON assembled_quiz (course_id);

-- One course per activity, enforced here rather than by the table shape (see
-- activity_type_course's own header comment) — a second insert for an already-linked
-- activity_type fails with 23505, the same race handling every other "exactly one" constraint
-- in this schema uses (uq_session_log_one_active, uq_instructor_llm_config_one_active).
ALTER TABLE activity_type_course ADD CONSTRAINT uq_activity_type_course_activity_type UNIQUE (activity_type);
-- "Every activity available in this course" (the student discovery list, and the instructor's
-- per-course catalog view) filters on exactly this column.
CREATE INDEX ix_activity_type_course_course_id ON activity_type_course (course_id);
-- GitHub #361: a quiz cannot exclude the same question twice, and "every question this quiz has
-- excluded" (subtracted from the draw pool) filters on assembled_quiz_id.
ALTER TABLE quiz_excluded_question ADD CONSTRAINT uq_quiz_excluded_question UNIQUE (assembled_quiz_id, question_id);
CREATE INDEX ix_quiz_excluded_question_quiz_id ON quiz_excluded_question (assembled_quiz_id);

-- At most one running session per student and activity type. This is what
-- makes POST /api/sessions idempotent: "start" and "resume" are the same
-- call, and two devices cannot build up independent state.
CREATE UNIQUE INDEX uq_session_log_one_active
  ON session_log (user_id, activity_type)
  WHERE status = 'in-progress';

-- At most one active LLM config across all instructors (global, unlike
-- uq_session_log_one_active which partitions by user_id/activity_type).
-- Activating a new config deactivates the previous one in the same
-- transaction; a 23505 race on this index is handled the same way
-- POST /api/sessions handles uq_session_log_one_active's race.
CREATE UNIQUE INDEX uq_instructor_llm_config_one_active
  ON instructor_llm_config (is_active)
  WHERE is_active = true;

-- No duplicate position and no duplicate question within one session.
ALTER TABLE session_to_question ADD CONSTRAINT uq_session_to_question_position UNIQUE (session_id, position);
ALTER TABLE session_to_question ADD CONSTRAINT uq_session_to_question_question UNIQUE (session_id, question_id);

-- Same two guarantees for the drawn user stories: no duplicate position, and — the third
-- acceptance criterion of the "remember which 4 stories were drawn" story — no story drawn
-- twice into the same session.
ALTER TABLE session_to_user_story ADD CONSTRAINT uq_session_to_user_story_position UNIQUE (session_id, position);
ALTER TABLE session_to_user_story ADD CONSTRAINT uq_session_to_user_story_story UNIQUE (session_id, user_story_id);

-- One answer per question per session: the second insert fails and the
-- answers route returns 409 plus the current session state.
ALTER TABLE answered_question_log ADD CONSTRAINT uq_answered_question_log_session_question UNIQUE (session_id, question_id);

-- Same guarantee for acceptance-criteria submissions: at most one submission per story per
-- session, so a resubmission attempt fails (23505) instead of overwriting the original — the
-- submissions route should handle that race the same way the answers route handles
-- uq_answered_question_log_session_question. NULL session_id rows are exempt (Postgres treats
-- every NULL as distinct from every other), which only affects submissions made before session
-- wiring existed.
ALTER TABLE submission ADD CONSTRAINT uq_submission_session_user_story UNIQUE (session_id, user_story_id);

-- GitHub #337: the server-side "one attempt per day" rule. A second POST for the same UTC day
-- cannot insert a second row, race or not — the same mechanism as uq_session_log_one_active,
-- just a plain unique index rather than a partial one since every row here counts, not only
-- in-progress ones.
ALTER TABLE daily_challenge_attempt ADD CONSTRAINT uq_daily_challenge_attempt_user_date UNIQUE (user_id, challenge_date);

-- The daily draw's course-scoped pool query and the per-student attempt lookup both filter here.
CREATE INDEX ix_daily_challenge_attempt_user_id ON daily_challenge_attempt (user_id);


-- =====================================================================
-- Score roll-up
--
-- The increment must live inside the SQL statement: under READ COMMITTED
-- a concurrent transaction blocks on the row lock and re-evaluates the
-- expression after the commit. A read-modify-write in application code
-- would lose updates.
-- =====================================================================

CREATE FUNCTION bump_session_score() RETURNS trigger AS $$
BEGIN
  UPDATE session_log
     SET cumulative_score = cumulative_score + NEW.score
   WHERE session_id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_answered_question_log_score
  AFTER INSERT ON answered_question_log
  FOR EACH ROW EXECUTE FUNCTION bump_session_score();

-- submission is write-before-disclose (llm_score starts NULL, a later UPDATE fills it in once
-- grading finishes — see submission's own header comment), so the roll-up fires on that UPDATE
-- instead of on INSERT the way answered_question_log's does. The OLD.llm_score IS NULL guard
-- keeps a later, unrelated UPDATE of an already-graded row (there isn't one today, but nothing
-- stops a future one) from double-counting the score.
CREATE FUNCTION bump_session_score_from_submission() RETURNS trigger AS $$
BEGIN
  IF NEW.session_id IS NOT NULL AND NEW.llm_score IS NOT NULL AND OLD.llm_score IS NULL THEN
    UPDATE session_log
       SET cumulative_score = cumulative_score + NEW.llm_score
     WHERE session_id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_submission_score
  AFTER UPDATE OF llm_score ON submission
  FOR EACH ROW EXECUTE FUNCTION bump_session_score_from_submission();


-- =====================================================================
-- Row Level Security
--
-- Tables in the public schema without RLS are readable through the REST
-- API with the anon key. For the question bank that would hand out
-- answer.is_correct and answer.explanation before the student answers,
-- so those tables get RLS with no policy at all — every access has to go
-- through an API route using the service role key.
--
-- The API routes bypass RLS (service role), so they must keep deriving
-- user_id from the auth session themselves. This is defense in depth,
-- not a replacement for the checks in the routes.
-- =====================================================================

ALTER TABLE question ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_to_answer ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_to_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_to_user_story ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_story ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_llm_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE course ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_course ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembled_quiz ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembled_quiz_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_type_course ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_excluded_question ENABLE ROW LEVEL SECURITY;

ALTER TABLE session_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE answered_question_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_challenge_attempt ENABLE ROW LEVEL SECURITY;

-- Without this, "user" is readable through PostgREST with the anon key —
-- the real names of every student in the class, next to the performance
-- data the instructor routes already expose deliberately. The instructor
-- reads are unaffected: they run on the service role key, which bypasses
-- RLS, and requireInstructor (lib/instructorAuth.ts) is what authorises
-- them. Profile writes go through app/api/profile, also service role, so
-- SELECT is the only policy needed here.
--
-- Still open, same class of problem, out of scope for this change:
-- badge, user_badge and title_definition have no RLS either.
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_user_select ON "user"
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY own_sessions_select ON session_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY own_sessions_insert ON session_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- GitHub #93: user_id removed from answered_question_log — ownership is now
-- derived via the session_log join instead of a direct column check.
CREATE POLICY own_answers_select ON answered_question_log
  FOR SELECT USING (
    auth.uid() = (SELECT user_id FROM session_log WHERE session_id = answered_question_log.session_id)
  );
CREATE POLICY own_answers_insert ON answered_question_log
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT user_id FROM session_log WHERE session_id = answered_question_log.session_id)
  );

-- No UPDATE policy: grading (llm_score/llm_feedback/graded_at) is only ever
-- written by a service-role route, never directly by the student.
CREATE POLICY own_submissions_select ON submission
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY own_submissions_insert ON submission
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- GitHub #337: same own-row shape as session_log above. No UPDATE policy — recording the
-- submitted answer is service-role only, same as submission's grading columns.
CREATE POLICY own_daily_challenge_attempt_select ON daily_challenge_attempt
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY own_daily_challenge_attempt_insert ON daily_challenge_attempt
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- =====================================================================
-- Migration notes
-- =====================================================================

-- Coming from the starter template, which had myapp_profile (id,
-- username, biography, avatar_url)? Rename it instead of running the
-- CREATE TABLE "user" statement above, so existing profiles survive:
--
--   ALTER TABLE myapp_profile RENAME TO "user";
--   ALTER TABLE "user" RENAME COLUMN id TO user_id;
--   ALTER TABLE "user" ALTER COLUMN biography DROP DEFAULT;
--   ALTER TABLE "user" ADD COLUMN role text NOT NULL DEFAULT 'student';
--
-- The old table already referenced auth.users(id), so fk_user_auth_users
-- is not needed in that case.

-- Re-running this script on a database that already has these tables?
-- The statements above are deliberately plain (no IF NOT EXISTS), so drop
-- first. CASCADE takes care of the foreign key order:
--
--   DROP TABLE IF EXISTS session_to_question, session_to_user_story,
--                        answered_question_log, session_log,
--                        question_to_answer, answer, question, user_badge,
--                        badge, title_definition, activity_type CASCADE;
--                        user_story, submission, instructor_llm_config,
--                        student_course, course CASCADE;
--   DROP FUNCTION IF EXISTS bump_session_score() CASCADE;
--   DROP FUNCTION IF EXISTS bump_session_score_from_submission() CASCADE;
--
-- Leaving "user" out of that list keeps the profiles.

-- Issue #61 (first/last name, age, semester on the profile page): if your
-- "user" table already exists from an earlier run of this script, add the
-- new columns instead of recreating the table:
--
--   ALTER TABLE "user" ADD COLUMN IF NOT EXISTS first_name text;
--   ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_name text;
--   ALTER TABLE "user" ADD COLUMN IF NOT EXISTS age int2
--     CHECK (age IS NULL OR (age > 0 AND age < 130));
--   ALTER TABLE "user" ADD COLUMN IF NOT EXISTS semester int2
--     CHECK (semester IS NULL OR (semester > 0 AND semester <= 20));

-- GitHub #82 (instructor role): if your "user" table predates the role column entirely, add it
-- (it already has DEFAULT 'student' above for fresh databases); either way, add the check
-- constraint so a typo can't silently create a third role the app doesn't know how to route:
--
--   ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'student';
--   ALTER TABLE "user" ADD CONSTRAINT ck_user_role CHECK (role IN ('student', 'instructor'));

-- Fix (session difficulty level bug): session_log.difficulty_level has always existed (DEFAULT 1),
-- so no column change is needed here -- only the missing CHECK constraint. Safe to add against
-- existing rows: every session was previously inserted at level 1 regardless of activity type.
--
--   ALTER TABLE session_log ADD CONSTRAINT ck_session_log_difficulty_level CHECK (difficulty_level BETWEEN 1 AND 3);

-- GitHub #96 (answered_question_log.answer_id renamed to submitted_option, so the column name
-- says what it holds — the option the student picked, not a row in the answer table). RENAME
-- COLUMN carries the existing FK and its constraint name along automatically, so nothing else
-- needs to change:
--
--   ALTER TABLE answered_question_log RENAME COLUMN answer_id TO submitted_option;

-- GitHub #123 (activity_type columns turned into foreign keys against the activity_type table
-- added in #122): if your database already has that table but not these constraints yet —
--
--   ALTER TABLE question ADD CONSTRAINT fk_question_activity_type
--     FOREIGN KEY (activity_type) REFERENCES activity_type (activity_type);
--   ALTER TABLE session_log ADD CONSTRAINT fk_session_log_activity_type
--     FOREIGN KEY (activity_type) REFERENCES activity_type (activity_type);
--   ALTER TABLE title_definition DROP CONSTRAINT IF EXISTS ck_title_definition_activity_type;
--   ALTER TABLE title_definition ADD CONSTRAINT fk_title_definition_activity_type
--     FOREIGN KEY (activity_type) REFERENCES activity_type (activity_type);

-- GitHub #201 (question.user_id — which instructor created the question, for #116): if your
-- "question" table predates this column, add it and its FK; existing rows get NULL, meaning
-- no specific creator, same as a fresh run of this script gives the seeded question bank —
--
--   ALTER TABLE question ADD COLUMN IF NOT EXISTS user_id uuid;
--   ALTER TABLE question ADD CONSTRAINT fk_question_user FOREIGN KEY (user_id) REFERENCES "user" (user_id);

-- User Story bank (new table, no rename path — it has no starter-template or prior-schema
-- predecessor): if your database already has everything above and you only need this table,
-- run just its CREATE TABLE, CHECK constraint, index, fk_user_story_user, and RLS statements
-- from this script instead of re-running the whole thing. fk_user_story_user requires the
-- "user" table to already exist.

-- GitHub #133 (user_story.creator_id made nullable, so supabase/seed.sql can seed a starter set
-- of stories before any real "user" row exists — same reasoning as question.user_id above): if
-- your user_story table predates this change —
--
--   ALTER TABLE user_story ALTER COLUMN creator_id DROP NOT NULL;

-- Submission table (free-text answers + LLM grading, REQ-FU-1/REQ-FU-2): also a new table
-- with no rename path. Its two FKs (fk_submission_user, fk_submission_user_story) require
-- "user" and user_story to already exist, so run user_story's statements first if adding
-- both to an existing database.

-- submission.session_id (links a submission to the practice session/story it belongs to): if
-- your submission table predates this column, add it, its FK, and the uniqueness guarantee —
-- fk_submission_session requires session_log to already exist:
--
--   ALTER TABLE submission ADD COLUMN IF NOT EXISTS session_id uuid;
--   ALTER TABLE submission ADD CONSTRAINT fk_submission_session
--     FOREIGN KEY (session_id) REFERENCES session_log (session_id) ON DELETE CASCADE;
--   ALTER TABLE submission ADD CONSTRAINT uq_submission_session_user_story
--     UNIQUE (session_id, user_story_id);

-- Instructor LLM Config table: also new, no rename path. Its FK (fk_instructor_llm_config_user)
-- requires "user" to already exist. uq_instructor_llm_config_one_active is a global partial
-- unique index (not scoped by user_id) — at most one row across the whole table can have
-- is_active = true at a time.

-- Class-wide instructor reads (GitHub #82): the indexes and the RLS on "user" are both new. On
-- an existing database run them separately — none of them rewrites a table, and CREATE INDEX
-- takes only a SHARE lock, so this is safe on a live deployment:
--
--   CREATE INDEX ix_session_log_user_id ON session_log (user_id);
--   CREATE INDEX ix_session_log_ended_at ON session_log (ended_at DESC, started_at DESC);
--   CREATE INDEX ix_user_role ON "user" (role);
--
--   ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY own_user_select ON "user" FOR SELECT USING (auth.uid() = user_id);
--
-- Enabling RLS on a table that had none takes effect immediately for anon/authenticated
-- callers. Verify afterwards that the app still works end to end — every route that touches
-- "user" uses the service role key and is therefore unaffected, but a future route that
-- reaches for the anon client would start returning empty results instead of erroring.

-- LLM model selection: if your instructor_llm_config table already exists from an earlier run
-- of this script, add the new column instead of recreating the table. model is NOT NULL with no
-- DEFAULT (no single model is a sensible fallback across CLAUDE/CHATGPT/GEMINI) — safe today
-- because nothing writes to this table yet, so it has no rows in any real deployment; if that
-- stops being true before this runs, backfill a value before adding the constraint:
--
--   ALTER TABLE instructor_llm_config ADD COLUMN IF NOT EXISTS model text NOT NULL;

-- REQ-DL-5 (course / student_course): also new tables, no rename path. course.fk_course_user
-- requires "user" to already exist; student_course's two FKs require "user" and course. If your
-- database has everything above and you only need these two tables, run just their CREATE TABLE,
-- fk_course_user, fk_student_course_user, fk_student_course_course, uq_course_code,
-- uq_student_course_user_course, ix_course_creator_id, and RLS statements from this script.
--
-- If your course table predates the creator_id rename or the nullable course_code (both added
-- before this table was ever deployed, so no real database has the old shape) —
--
--   ALTER TABLE course RENAME COLUMN user_id TO creator_id;
--   ALTER TABLE course ALTER COLUMN course_code DROP NOT NULL;

-- session_to_user_story (the 4 drawn user stories for a practice session, same shape as
-- session_to_question): also a new table, no rename path. Its two FKs
-- (fk_session_to_user_story_session, fk_session_to_user_story_user_story) require session_log
-- and user_story to already exist. If your database has everything above and you only need this
-- table, run just its CREATE TABLE, both FKs, uq_session_to_user_story_position,
-- uq_session_to_user_story_story, and RLS statements from this script.

-- Daily Challenge (GitHub #337): also a new table, no rename path. Its three FKs
-- (fk_daily_challenge_attempt_user, fk_daily_challenge_attempt_question,
-- fk_daily_challenge_attempt_answer) require "user", question and answer to already exist. If
-- your database has everything above and you only need this table, run just its CREATE TABLE,
-- all three FKs, uq_daily_challenge_attempt_user_date, ix_daily_challenge_attempt_user_id, and
-- RLS statements from this script.

-- Write Acceptance Criteria sessions: if your database already has session_to_user_story and
-- submission.session_id from an earlier run of this script but predates their being wired up to
-- real session_log rows (GitHub #260-ish "abandon doesn't persist" fix), the only two statements
-- you need are the missing activity_type lookup row (session_log.activity_type is FK-constrained
-- against it, so starting a session 500s without this) and the score roll-up trigger:
--
--   INSERT INTO activity_type (activity_type, quiz_name) VALUES
--     ('WRITE_ACCEPTANCE_CRITERIA', 'Write Acceptance Criteria')
--     ON CONFLICT DO NOTHING;
--
--   -- then the bump_session_score_from_submission() function and trg_submission_score trigger
--   -- defined above, under "Score roll-up".

-- GitHub #318 (first-login guided tour): if your "user" table predates this column, add it —
-- existing rows backfill to false, so every account already in the database is offered the
-- tour once, exactly like a freshly registered one:
--
--   ALTER TABLE "user" ADD COLUMN IF NOT EXISTS has_seen_onboarding_tour bool NOT NULL DEFAULT false;

-- GitHub #347 (create and browse quizzes): if your activity_type table predates quiz_name/
-- description/creator_id, add them without touching the three existing rows' keys — every
-- existing FK to activity_type (question, session_log, title_definition) and every existing
-- session stays exactly as it was, since the primary key itself never changes.
--
-- quiz_name can't go straight to NOT NULL: Postgres would reject the ADD COLUMN outright on a
-- table that already has rows and no default to fill them with. Add it nullable, backfill, then
-- tighten the constraint — three statements instead of one, but no data loss and no window where
-- a half-migrated table is unusable. On a lookup table this small (three built-in rows plus
-- however many quizzes instructors have since created), none of these steps takes a
-- meaningful lock or any real time:
--
--   ALTER TABLE activity_type ADD COLUMN IF NOT EXISTS quiz_name text;
--   ALTER TABLE activity_type ADD COLUMN IF NOT EXISTS description text;
--   ALTER TABLE activity_type ADD COLUMN IF NOT EXISTS creator_id uuid;
--
--   -- Backfill from lib/activityContent.ts's ACTIVITIES[].name — the exact names the app
--   -- already shows for these three activities everywhere else.
--   UPDATE activity_type SET quiz_name = 'Identify Weak User Stories'
--     WHERE activity_type = 'IDENTIFY_WEAK_USER_STORIES' AND quiz_name IS NULL;
--   UPDATE activity_type SET quiz_name = 'Identify Weak Acceptance Criteria'
--     WHERE activity_type = 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA' AND quiz_name IS NULL;
--   UPDATE activity_type SET quiz_name = 'Write Acceptance Criteria'
--     WHERE activity_type = 'WRITE_ACCEPTANCE_CRITERIA' AND quiz_name IS NULL;
--   -- Fallback for any other row already in the table (e.g. one inserted through the old,
--   -- narrower POST /api/activities/types before this migration ran) — falls back to the key
--   -- itself rather than leaving a NULL that the next statement would reject.
--   UPDATE activity_type SET quiz_name = activity_type WHERE quiz_name IS NULL;
--
--   ALTER TABLE activity_type ALTER COLUMN quiz_name SET NOT NULL;
--   ALTER TABLE activity_type ADD CONSTRAINT fk_activity_type_user
--     FOREIGN KEY (creator_id) REFERENCES "user" (user_id);
--
-- creator_id is left NULL for every pre-existing row by this migration, same as a fresh run of
-- this script gives the three seeded rows — "Built-in" is the correct attribution for all of
-- them, not a gap to fill in later.

-- GitHub #360 (compose a quiz from one or more catalogs, scoped to a course): brand new tables,
-- no rename or backfill path — run the two CREATE TABLE statements, their two indexes/unique
-- constraint, the four ALTER TABLE ... ADD CONSTRAINT foreign keys, and
-- ALTER TABLE assembled_quiz[_catalog] ENABLE ROW LEVEL SECURITY from above. Nothing existing
-- changes shape: assembled_quiz_catalog.activity_type points at the same activity_type table
-- question.activity_type already does, so every catalog created before this migration is
-- immediately eligible to be referenced by a new quiz.

-- Activity-Course link (tie every activity_type to a course, gate student visibility by
-- enrollment): also a brand new table, no rename or backfill path — run its CREATE TABLE
-- statement, both ALTER TABLE ... ADD CONSTRAINT foreign keys, uq_activity_type_course_activity_type,
-- ix_activity_type_course_course_id, and ALTER TABLE activity_type_course ENABLE ROW LEVEL SECURITY
-- from above.
--
-- Every activity_type that existed before this migration — including the three seeded built-ins
-- — starts with no row here, which per this table's own header comment means "not available to
-- any student" until an instructor links it to one of their courses. That is the correct
-- behavior of a fresh migration, not a bug to patch around: nothing before this change ever
-- checked course enrollment, so there is no prior "which course was this really for" data to
-- backfill from. If a deployment needs the built-ins usable immediately, an operator has to link
-- each one explicitly, e.g. for a single default course:
--
--   INSERT INTO activity_type_course (activity_type, course_id)
--   SELECT activity_type, '<course-uuid>' FROM activity_type WHERE creator_id IS NULL
--   ON CONFLICT DO NOTHING;
-- GitHub #361 (per-quiz question exclusions): another brand new table, same no-rename/no-backfill
-- path as #360 above — run the CREATE TABLE quiz_excluded_question statement, its two FKs
-- (fk_quiz_excluded_question_quiz, fk_quiz_excluded_question_question), its unique constraint and
-- index, and ALTER TABLE quiz_excluded_question ENABLE ROW LEVEL SECURITY. No existing table's
-- shape changes; a database that already has assembled_quiz/assembled_quiz_catalog from #360
-- needs nothing else.
