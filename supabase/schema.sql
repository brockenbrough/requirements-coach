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
    PRIMARY KEY (user_id));

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
    creator_id       uuid        NOT NULL,
    PRIMARY KEY (user_story_id));

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
-- REQ-DL-4: Answered Question Log
--
-- Tracks which user answered (user_id), the score achieved for that
-- specific submission (score), and the session it belongs to
-- (session_id) so a resumed activity can tell which of the 4 questions
-- are already done.
-- ---------------------------------------------------------------------
CREATE TABLE answered_question_log (
    log_id uuid NOT NULL,
    submitted_at timestamp NOT NULL DEFAULT now(),
    score int4 NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    question_id uuid NOT NULL,
    submitted_option uuid NOT NULL,
    PRIMARY KEY (log_id));


-- =====================================================================
-- Foreign Keys
-- Naming pattern: fk_<table_with_the_fk>_<referenced_table>
-- =====================================================================

-- Ties the profile row to the Supabase auth account, so user_id equals
-- auth.uid() and deleting the account cleans up everything behind it.
ALTER TABLE "user" ADD CONSTRAINT fk_user_auth_users FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE question_to_answer ADD CONSTRAINT fk_question_to_answer_question FOREIGN KEY (question_id) REFERENCES question (question_id);
ALTER TABLE question_to_answer ADD CONSTRAINT fk_question_to_answer_answer FOREIGN KEY (answer_id) REFERENCES answer (answer_id);

ALTER TABLE user_badge ADD CONSTRAINT fk_user_badge_user FOREIGN KEY (user_id) REFERENCES "user" (user_id);
ALTER TABLE user_badge ADD CONSTRAINT fk_user_badge_badge FOREIGN KEY (badge_id) REFERENCES badge (badge_id);

-- Who authored the story, for attribution/moderation.
ALTER TABLE user_story ADD CONSTRAINT fk_user_story_user FOREIGN KEY (creator_id) REFERENCES "user" (user_id);

ALTER TABLE answered_question_log ADD CONSTRAINT fk_answered_question_log_user FOREIGN KEY (user_id) REFERENCES "user" (user_id);
ALTER TABLE answered_question_log ADD CONSTRAINT fk_answered_question_log_question FOREIGN KEY (question_id) REFERENCES question (question_id);
ALTER TABLE answered_question_log ADD CONSTRAINT fk_answered_question_log_answer FOREIGN KEY (submitted_option) REFERENCES answer (answer_id);
ALTER TABLE answered_question_log ADD CONSTRAINT fk_answered_question_log_session FOREIGN KEY (session_id) REFERENCES session_log (session_id) ON DELETE CASCADE;

ALTER TABLE session_log ADD CONSTRAINT fk_session_log_user FOREIGN KEY (user_id) REFERENCES "user" (user_id);
ALTER TABLE session_log ADD CONSTRAINT fk_session_log_badge FOREIGN KEY (badge_id) REFERENCES badge (badge_id);

ALTER TABLE session_to_question ADD CONSTRAINT fk_session_to_question_session FOREIGN KEY (session_id) REFERENCES session_log (session_id) ON DELETE CASCADE;
ALTER TABLE session_to_question ADD CONSTRAINT fk_session_to_question_question FOREIGN KEY (question_id) REFERENCES question (question_id);


-- =====================================================================
-- Constraints and indexes
-- =====================================================================

ALTER TABLE question ADD CONSTRAINT ck_question_difficulty_level CHECK (difficulty_level BETWEEN 1 AND 3);

ALTER TABLE user_story ADD CONSTRAINT ck_user_story_difficulty_level CHECK (difficulty_level BETWEEN 1 AND 3);

-- Mirrors ix_question_activity_type_difficulty: the draw for a random
-- story filters on exactly this pair.
CREATE INDEX ix_user_story_activity_type_difficulty ON user_story (activity_type, difficulty_level);

-- REQ-GAM-DL-2.1: activity type restricted to the known set, one title per
-- (activity_type, difficulty_level) pair so the BL-1 lookup is unambiguous.
ALTER TABLE title_definition ADD CONSTRAINT ck_title_definition_difficulty_level CHECK (difficulty_level BETWEEN 1 AND 3);
ALTER TABLE title_definition ADD CONSTRAINT ck_title_definition_activity_type CHECK (activity_type IN ('IDENTIFY_WEAK_USER_STORIES', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA'));
ALTER TABLE title_definition ADD CONSTRAINT uq_title_definition_activity_level UNIQUE (activity_type, difficulty_level);

ALTER TABLE session_log ADD CONSTRAINT ck_session_log_status CHECK (status IN ('in-progress', 'completed', 'abandoned'));

-- GitHub #82: the only two roles the app understands. Set at profile-creation time from
-- auth.users.raw_user_meta_data.role (see app/api/profile/route.ts) — INSTRUCTOR_SIGNUP_CODE
-- is what gets a signup that metadata in the first place (app/api/auth/register/route.ts).
ALTER TABLE "user" ADD CONSTRAINT ck_user_role CHECK (role IN ('student', 'instructor'));

-- The draw for a new session filters on exactly this pair.
CREATE INDEX ix_question_activity_type_difficulty ON question (activity_type, difficulty_level);

-- At most one running session per student and activity type. This is what
-- makes POST /api/sessions idempotent: "start" and "resume" are the same
-- call, and two devices cannot build up independent state.
CREATE UNIQUE INDEX uq_session_log_one_active
  ON session_log (user_id, activity_type)
  WHERE status = 'in-progress';

-- No duplicate position and no duplicate question within one session.
ALTER TABLE session_to_question ADD CONSTRAINT uq_session_to_question_position UNIQUE (session_id, position);
ALTER TABLE session_to_question ADD CONSTRAINT uq_session_to_question_question UNIQUE (session_id, question_id);

-- One answer per question per session: the second insert fails and the
-- answers route returns 409 plus the current session state.
ALTER TABLE answered_question_log ADD CONSTRAINT uq_answered_question_log_session_question UNIQUE (session_id, question_id);


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
ALTER TABLE user_story ENABLE ROW LEVEL SECURITY;

ALTER TABLE session_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE answered_question_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_sessions_select ON session_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY own_sessions_insert ON session_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY own_answers_select ON answered_question_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY own_answers_insert ON answered_question_log
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
--   DROP TABLE IF EXISTS session_to_question, answered_question_log,
--                        session_log, question_to_answer, answer,
--                        question, user_badge, badge, title_definition,
--                        user_story CASCADE;
--   DROP FUNCTION IF EXISTS bump_session_score() CASCADE;
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

-- GitHub #96 (answered_question_log.answer_id renamed to submitted_option, so the column name
-- says what it holds — the option the student picked, not a row in the answer table). RENAME
-- COLUMN carries the existing FK and its constraint name along automatically, so nothing else
-- needs to change:
--
--   ALTER TABLE answered_question_log RENAME COLUMN answer_id TO submitted_option;

-- User Story bank (new table, no rename path — it has no starter-template or prior-schema
-- predecessor): if your database already has everything above and you only need this table,
-- run just its CREATE TABLE, CHECK constraint, index, fk_user_story_user, and RLS statements
-- from this script instead of re-running the whole thing. fk_user_story_user requires the
-- "user" table to already exist.
