-- Run this in your Supabase SQL editor to create the profile table.

--create table if not exists myapp_profile (
--  id         uuid primary key references auth.users(id) on delete cascade,
--  username   text not null,
--  biography  text not null default '',
--  avatar_url text,
--  role       text not null default 'student'
--);

-- If myapp_profile already exists from an earlier version, add the avatar_url column:
-- alter table myapp_profile add column if not exists avatar_url text;

-- Create a public storage bucket for avatar images.
-- In the Supabase dashboard: Storage → New bucket → name "avatars" → check "Public bucket".



-- =====================================================================
--
-- Change for REQ-DL-4 (Create Answered Question Log):
--   Answered_Question_Log now also tracks WHICH USER answered
--   (column "Userid", FK to "User") and the SCORE achieved for that
--   specific submission (column "score"). Everything else is
--   unchanged from the existing schema.
-- =====================================================================

CREATE TABLE user (
    user_id uuid NOT NULL,
    username text NOT NULL,
    biography text NOT NULL,
    avatar_url text,
    role text NOT NULL DEFAULT 'student', 
    PRIMARY KEY (user_id));
 
CREATE TABLE question (
    question_id uuid NOT NULL,
    question_prompt text NOT NULL,
    difficulty_level int2 NOT NULL,
    activity_type varchar(50) NOT NULL,
    order_number int4 NOT NULL,
    max_score int4,
    PRIMARY KEY (question_id));
 
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
 
CREATE TABLE user_badge (
    user_badge_id uuid NOT NULL,
    created_at timestamp NOT NULL,
    user_id uuid NOT NULL,
    badge_id uuid NOT NULL,
    PRIMARY KEY (user_badge_id));
 
-- ---------------------------------------------------------------------
-- REQ-DL-4: Answered Question Log
-- ---------------------------------------------------------------------
CREATE TABLE answered_question_log (
    log_id uuid NOT NULL,
    submitted_at timestamp NOT NULL,
    score int4 NOT NULL,
    user_id uuid NOT NULL,
    question_id uuid NOT NULL,
    answer_id uuid NOT NULL,
    PRIMARY KEY (log_id));
 
  
-- =====================================================================
-- Foreign Keys
-- Naming pattern: fk_<table_with_the_fk>_<referenced_table>
-- =====================================================================
 
ALTER TABLE question_to_answer ADD CONSTRAINT fk_question_to_answer_question FOREIGN KEY (question_id) REFERENCES question (question_id);
ALTER TABLE question_to_answer ADD CONSTRAINT fk_question_to_answer_answer FOREIGN KEY (answer_id) REFERENCES answer (answer_id);
 
ALTER TABLE user_badge ADD CONSTRAINT fk_user_badge_user FOREIGN KEY (user_id) REFERENCES "user" (user_id);
ALTER TABLE user_badge ADD CONSTRAINT fk_user_badge_badge FOREIGN KEY (badge_id) REFERENCES badge (badge_id);
 
ALTER TABLE answered_question_log ADD CONSTRAINT fk_answered_question_log_user FOREIGN KEY (user_id) REFERENCES "user" (user_id);
ALTER TABLE answered_question_log ADD CONSTRAINT fk_answered_question_log_question FOREIGN KEY (question_id) REFERENCES question (question_id);
ALTER TABLE answered_question_log ADD CONSTRAINT fk_answered_question_log_answer FOREIGN KEY (answer_id) REFERENCES answer (answer_id);


-- =====================================================================

--UserStory: REQ-DL-3

-- =====================================================================
CREATE TABLE session_log (
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    activity_type varchar(50) NOT NULL,
    started_at timestamp NOT NULL,
    ended_at timestamp,
    score int4,
    badge_id uuid,
    PRIMARY KEY (session_id));

ALTER TABLE session_log ADD CONSTRAINT fk_session_log_user FOREIGN KEY (user_id) REFERENCES "user" (id);
ALTER TABLE session_log ADD CONSTRAINT fk_session_log_badge FOREIGN KEY (badge_id) REFERENCES badge (badge_id);





--INSERT Commands

-- =====================================================================
-- Seed data for Activity "Identify Weak User Stories" (Type A)
-- 18 questions (6 per difficulty level), 4 answer options each
--
-- Updated to match the snake_case schema.sql (tables: question,
-- answer, question_to_answer; columns: answer_id, option_text,
-- explanation, is_correct, question_id, answer_id).
--
-- UUID scheme (used only for deterministic, collision-free IDs):
--   question(N)      -> 00000000-0000-0000-0000-0000000000NN
--   answer(N, Opt i)  -> 00000000-0000-0000-0001-0000000000XX   (XX = N*10 + i, i: 1=A,2=B,3=C,4=D)
--
-- activity_type is set to 'IDENTIFY_WEAK_USER_STORIES' here –
-- please adjust to whatever string your application actually expects,
-- if it differs (e.g. 'TYPE_A' or similar).
-- =====================================================================

-- =====================================================================
-- 1) QUESTIONS
-- =====================================================================

INSERT INTO question (question_id, question_prompt, difficulty_level, activity_type, order_number, max_score) VALUES
('00000000-0000-0000-0000-000000000001', 'Which is the primary weakness of the following user story?

"I want to search for products so that I can find items more quickly."', 1, 'IDENTIFY_WEAK_USER_STORIES', 1, 25),

('00000000-0000-0000-0000-000000000002', 'Which is the primary weakness of the following user story?

"As a customer, I want to receive an email notification."', 1, 'IDENTIFY_WEAK_USER_STORIES', 2, 25),

('00000000-0000-0000-0000-000000000003', 'Which is the primary weakness of the following user story?

"As a customer, I want the checkout process to be better so that shopping is more enjoyable."', 1, 'IDENTIFY_WEAK_USER_STORIES', 3, 25),

('00000000-0000-0000-0000-000000000004', 'Which is the primary weakness of the following user story?

"As a user, I want the application to always work perfectly so that I never experience any problems."', 1, 'IDENTIFY_WEAK_USER_STORIES', 4, 25),

('00000000-0000-0000-0000-000000000005', 'Which is the primary weakness of the following user story?

"As a customer, I want the system to use PostgreSQL so that my orders can be stored."', 1, 'IDENTIFY_WEAK_USER_STORIES', 5, 25),

('00000000-0000-0000-0000-000000000006', 'Which is the primary weakness of the following user story?

"As a developer, I want to rename the variable customerList to customers so that the code looks cleaner."', 1, 'IDENTIFY_WEAK_USER_STORIES', 6, 25),

('00000000-0000-0000-0000-000000000007', 'Which is the primary weakness of the following user story?

"As a customer, I want to search for products, compare them, add them to my cart, pay, and track my shipment so that I can complete my purchase."', 2, 'IDENTIFY_WEAK_USER_STORIES', 7, 25),

('00000000-0000-0000-0000-000000000008', 'Which is the primary weakness of the following user story?

"As a user, I want to edit customer accounts so that customer information stays up to date."', 2, 'IDENTIFY_WEAK_USER_STORIES', 8, 25),

('00000000-0000-0000-0000-000000000009', 'Which is the primary weakness of the following user story?

"As a store manager, I want product searches to be fast so that customers don''t have to wait."', 2, 'IDENTIFY_WEAK_USER_STORIES', 9, 25),

('00000000-0000-0000-0000-000000000010', 'Which is the primary weakness of the following user story?

"As a customer, I want to cancel an order so that I can correct a mistake."', 2, 'IDENTIFY_WEAK_USER_STORIES', 10, 25),

('00000000-0000-0000-0000-000000000011', 'Which is the primary weakness of the following user story?

"As a customer, I want a red confirmation dialog with two buttons implemented in JavaScript so that I can delete my account."', 2, 'IDENTIFY_WEAK_USER_STORIES', 11, 25),

('00000000-0000-0000-0000-000000000012', 'Which is the primary weakness of the following user story?

"As a customer, I want to reset my password so that I can access my account again."

Acceptance Criterion: "The password reset should work correctly."', 2, 'IDENTIFY_WEAK_USER_STORIES', 12, 25),

('00000000-0000-0000-0000-000000000013', 'Which is the primary weakness of the following user story?

"As a customer, I want to receive personalized recommendations so that I can discover products I may like."

(The recommendation feature depends on another unfinished tracking feature.)', 3, 'IDENTIFY_WEAK_USER_STORIES', 13, 25),

('00000000-0000-0000-0000-000000000014', 'Which is the primary weakness of the following user story?

"As a customer, I want the shopping cart database table to be created so that my cart can later be displayed."', 3, 'IDENTIFY_WEAK_USER_STORIES', 14, 25),

('00000000-0000-0000-0000-000000000015', 'Which is the primary weakness of the following user story?

"As a customer, I want to stay logged in so that I don''t have to enter my password repeatedly."

Acceptance Criteria:
- Stay logged in for 30 days.
- Automatically log out after 15 minutes.
- Never log out automatically.', 3, 'IDENTIFY_WEAK_USER_STORIES', 15, 25),

('00000000-0000-0000-0000-000000000016', 'Which is the primary weakness of the following user story?

"As a customer, I want product search to use Elasticsearch with fuzzy search and a boost factor of 2.0 so that I can find products."', 3, 'IDENTIFY_WEAK_USER_STORIES', 16, 25),

('00000000-0000-0000-0000-000000000017', 'Which is the primary weakness of the following user story?

"As a system administrator, I want the company logo moved three pixels to the left so that the page looks slightly nicer."', 3, 'IDENTIFY_WEAK_USER_STORIES', 17, 25),

('00000000-0000-0000-0000-000000000018', 'Which is the primary weakness of the following user story?

"As a customer, I want the online shop to be completely secure and extremely user-friendly so that I can shop without concerns."', 3, 'IDENTIFY_WEAK_USER_STORIES', 18, 25);


-- =====================================================================
-- 2) ANSWERS
-- =====================================================================

-- Question 1 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000011', 'The user role is missing.', 'Correct: the story does not start with "As a ...", so it is unclear who performs the action.', true),
('00000000-0000-0000-0001-000000000012', 'The story contains implementation details.', 'Incorrect: the story contains no technical details at all.', false),
('00000000-0000-0000-0001-000000000013', 'The story should include acceptance criteria.', 'Incorrect: missing acceptance criteria are not the main issue here.', false),
('00000000-0000-0000-0001-000000000014', 'The story is too detailed.', 'Incorrect: the story is rather too short than too detailed.', false);

-- Question 2 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000021', 'The story contains multiple features.', 'Incorrect: only a single feature is described.', false),
('00000000-0000-0000-0001-000000000022', 'The business value ("so that...") is missing.', 'Correct: the "so that..." part explaining the value to the customer is missing.', true),
('00000000-0000-0000-0001-000000000023', 'The story is too technical.', 'Incorrect: no technical details are mentioned.', false),
('00000000-0000-0000-0001-000000000024', 'The story contains too many actors.', 'Incorrect: only one actor (customer) appears.', false);

-- Question 3 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000031', 'The wording is too vague.', 'Correct: "better" and "more enjoyable" are subjective and not measurable/testable.', true),
('00000000-0000-0000-0001-000000000032', 'The role is incorrect.', 'Incorrect: "customer" is an appropriate role for the checkout process.', false),
('00000000-0000-0000-0001-000000000033', 'The story contains implementation details.', 'Incorrect: no specific technology or implementation is mentioned.', false),
('00000000-0000-0000-0001-000000000034', 'The story is too long.', 'Incorrect: length is not the problem, the vague wording is.', false);

-- Question 4 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000041', 'The expectation is unrealistic and not testable.', 'Correct: "always work perfectly" and "never experience any problems" cannot realistically be verified.', true),
('00000000-0000-0000-0001-000000000042', 'The story is missing a role.', 'Incorrect: the role "user" is stated.', false),
('00000000-0000-0000-0001-000000000043', 'The story contains too much business value.', 'Incorrect: "too much business value" is not a meaningful weakness category.', false),
('00000000-0000-0000-0001-000000000044', 'The story has too many acceptance criteria.', 'Incorrect: no acceptance criteria are given at all.', false);

-- Question 5 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000051', 'The story focuses on technical implementation instead of user value.', 'Correct: "PostgreSQL" is a concrete technical solution, not a user need.', true),
('00000000-0000-0000-0001-000000000052', 'The story contains multiple actors.', 'Incorrect: only one actor (customer) appears.', false),
('00000000-0000-0000-0001-000000000053', 'The role is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000054', 'The story is too short.', 'Incorrect: brevity is not the actual problem.', false);

-- Question 6 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000061', 'The story provides little business value.', 'Correct: a pure renaming delivers no recognizable value to users or the business.', true),
('00000000-0000-0000-0001-000000000062', 'The story is missing a role.', 'Incorrect: "developer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000063', 'The story contains too many acceptance criteria.', 'Incorrect: no acceptance criteria are given.', false),
('00000000-0000-0000-0001-000000000064', 'The story is too detailed.', 'Incorrect: excessive detail is not the issue here.', false);

-- Question 7 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000071', 'The story should be split into smaller stories.', 'Correct: searching, comparing, adding to cart, paying, and tracking are several independent stories.', true),
('00000000-0000-0000-0001-000000000072', 'The role is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000073', 'The story is too short.', 'Incorrect: the story is rather too long / too broad.', false),
('00000000-0000-0000-0001-000000000074', 'The story contains no business value.', 'Incorrect: "so that I can complete my purchase" describes the value.', false);

-- Question 8 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000081', 'The user role is too generic.', 'Correct: "user" is too unspecific; a concrete role such as "administrator" would be better.', true),
('00000000-0000-0000-0001-000000000082', 'The story is too detailed.', 'Incorrect: the story is rather too coarse than too detailed.', false),
('00000000-0000-0000-0001-000000000083', 'The story contains technical implementation.', 'Incorrect: no specific technology is mentioned.', false),
('00000000-0000-0000-0001-000000000084', 'The story has too much business value.', 'Incorrect: "too much business value" is not a meaningful weakness category.', false);

-- Question 9 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000091', '"Fast" is not measurable.', 'Correct: without a concrete threshold, "fast" cannot be tested.', true),
('00000000-0000-0000-0001-000000000092', 'The story has no actor.', 'Incorrect: "store manager" is stated as the role.', false),
('00000000-0000-0000-0001-000000000093', 'The story contains implementation details.', 'Incorrect: no specific technology is mentioned.', false),
('00000000-0000-0000-0001-000000000094', 'The story is too long.', 'Incorrect: length is not the problem here.', false);

-- Question 10 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000101', 'Important business conditions are missing.', 'Correct: conditions such as deadlines or refund rules for a cancellation are missing.', true),
('00000000-0000-0000-0001-000000000102', 'The story is too technical.', 'Incorrect: no technology or implementation is mentioned.', false),
('00000000-0000-0000-0001-000000000103', 'The actor is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000104', 'The story contains too many goals.', 'Incorrect: only one goal (cancellation) is described.', false);

-- Question 11 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000111', 'The story specifies UI and implementation details instead of user needs.', 'Correct: color, number of buttons, and JavaScript describe the implementation rather than the actual need.', true),
('00000000-0000-0000-0001-000000000112', 'The story contains multiple actors.', 'Incorrect: only one actor (customer) appears.', false),
('00000000-0000-0000-0001-000000000113', 'The role is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000114', 'The story is too short.', 'Incorrect: the story is, on the contrary, very detailed.', false);

-- Question 12 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000121', 'The acceptance criterion is too vague.', 'Correct: "should work correctly" is not concretely measurable or testable.', true),
('00000000-0000-0000-0001-000000000122', 'The actor is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000123', 'The story contains implementation details.', 'Incorrect: no specific implementation is described.', false),
('00000000-0000-0000-0001-000000000124', 'The story contains multiple business values.', 'Incorrect: only one value is stated.', false);

-- Question 13 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000131', 'The story has a hidden dependency.', 'Correct: the story depends on a still-unfinished tracking feature, which is not visible from the story itself.', true),
('00000000-0000-0000-0001-000000000132', 'The story is too short.', 'Incorrect: length is not the problem here.', false),
('00000000-0000-0000-0001-000000000133', 'The role is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000134', 'The business value is missing.', 'Incorrect: "so that I can discover products I may like" describes the value.', false);

-- Question 14 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000141', 'The story is sliced by technical implementation instead of user value.', 'Correct: the story is defined around a database table rather than a user-visible outcome.', true),
('00000000-0000-0000-0001-000000000142', 'The role is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000143', 'The story is too long.', 'Incorrect: the story is rather short and simple.', false),
('00000000-0000-0000-0001-000000000144', 'The story contains multiple actors.', 'Incorrect: only one actor (customer) appears.', false);

-- Question 15 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000151', 'The acceptance criteria contradict each other.', 'Correct: staying logged in for 30 days, auto-logout after 15 minutes, and never auto-logging out contradict one another.', true),
('00000000-0000-0000-0001-000000000152', 'The story is missing a role.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000153', 'The story is too technical.', 'Incorrect: no specific technology is mentioned.', false),
('00000000-0000-0000-0001-000000000154', 'The business value is unclear.', 'Incorrect: "so that I don''t have to enter my password repeatedly" is clearly stated.', false);

-- Question 16 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000161', 'The story specifies implementation details instead of user needs.', 'Correct: Elasticsearch, fuzzy search, and boost factor describe a technical solution rather than a user need.', true),
('00000000-0000-0000-0001-000000000162', 'The actor is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000163', 'The story is too short.', 'Incorrect: the story is, on the contrary, very detailed.', false),
('00000000-0000-0000-0001-000000000164', 'The business value is missing.', 'Incorrect: "so that I can find products" describes the value.', false);

-- Question 17 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000171', 'The story delivers little meaningful business value.', 'Correct: moving a logo three pixels provides virtually no relevant value.', true),
('00000000-0000-0000-0001-000000000172', 'The story is missing a role.', 'Incorrect: "system administrator" is stated as the role.', false),
('00000000-0000-0000-0001-000000000173', 'The story contains technical implementation.', 'Incorrect: no specific technology is mentioned.', false),
('00000000-0000-0000-0001-000000000174', 'The story contains multiple features.', 'Incorrect: only a single, very small change is described.', false);

-- Question 18 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000181', 'The quality goals are subjective and not measurable.', 'Correct: "completely secure" and "extremely user-friendly" cannot be objectively measured or tested.', true),
('00000000-0000-0000-0001-000000000182', 'The actor is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000183', 'The story contains multiple actors.', 'Incorrect: only one actor (customer) appears.', false),
('00000000-0000-0000-0001-000000000184', 'The story is too short.', 'Incorrect: length is not the problem here.', false);


-- =====================================================================
-- 3) QUESTION_TO_ANSWER (mapping)
-- =====================================================================

INSERT INTO question_to_answer (question_id, answer_id) VALUES
-- Q1
('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000011'),
('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000012'),
('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000013'),
('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000014'),
-- Q2
('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000021'),
('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000022'),
('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000023'),
('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000024'),
-- Q3
('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000031'),
('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000032'),
('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000033'),
('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000034'),
-- Q4
('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000041'),
('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000042'),
('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000043'),
('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000044'),
-- Q5
('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0001-000000000051'),
('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0001-000000000052'),
('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0001-000000000053'),
('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0001-000000000054'),
-- Q6
('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0001-000000000061'),
('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0001-000000000062'),
('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0001-000000000063'),
('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0001-000000000064'),
-- Q7
('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0001-000000000071'),
('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0001-000000000072'),
('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0001-000000000073'),
('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0001-000000000074'),
-- Q8
('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0001-000000000081'),
('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0001-000000000082'),
('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0001-000000000083'),
('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0001-000000000084'),
-- Q9
('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0001-000000000091'),
('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0001-000000000092'),
('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0001-000000000093'),
('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0001-000000000094'),
-- Q10
('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0001-000000000101'),
('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0001-000000000102'),
('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0001-000000000103'),
('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0001-000000000104'),
-- Q11
('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0001-000000000111'),
('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0001-000000000112'),
('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0001-000000000113'),
('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0001-000000000114'),
-- Q12
('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0001-000000000121'),
('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0001-000000000122'),
('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0001-000000000123'),
('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0001-000000000124'),
-- Q13
('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0001-000000000131'),
('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0001-000000000132'),
('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0001-000000000133'),
('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0001-000000000134'),
-- Q14
('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0001-000000000141'),
('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0001-000000000142'),
('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0001-000000000143'),
('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0001-000000000144'),
-- Q15
('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0001-000000000151'),
('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0001-000000000152'),
('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0001-000000000153'),
('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0001-000000000154'),
-- Q16
('00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0001-000000000161'),
('00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0001-000000000162'),
('00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0001-000000000163'),
('00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0001-000000000164'),
-- Q17
('00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0001-000000000171'),
('00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0001-000000000172'),
('00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0001-000000000173'),
('00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0001-000000000174'),
-- Q18
('00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0001-000000000181'),
('00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0001-000000000182'),
('00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0001-000000000183'),
('00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0001-000000000184');



-- =====================================================================
-- Seed data for Activity "Identify Weak Acceptance Criteria" (Type A)
-- 18 questions (6 per difficulty level), 4 answer options each.
--
-- Updated to match the snake_case schema.sql (tables: question,
-- answer, question_to_answer; columns: answer_id, option_text,
-- explanation, is_correct, question_id, answer_id).
--
-- UUID scheme (used only for deterministic, collision-free IDs):
--   question(N)       -> 00000000-0000-0000-0000-0000000001NN   (100+N, N=1..18)
--   answer(N, Opt i)   -> 00000000-0000-0000-0001-000000000XXX   (XXX = (100+N)*10 + i, i: 1=A,2=B,3=C,4=D)
--
-- This range (100+N) is intentionally offset from the "Identify Weak
-- User Stories" seed script (which used 1..18) so both scripts can be
-- run against the same database without ID collisions.
--
-- activity_type is set to 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA' here –
-- please adjust to whatever string your application actually expects
-- (e.g. 'TYPE_A_AC' or similar) if it differs.
-- =====================================================================

-- =====================================================================
-- 1) QUESTIONS
-- =====================================================================

INSERT INTO question (question_id, question_prompt, difficulty_level, activity_type, order_number, max_score) VALUES
('00000000-0000-0000-0000-000000000101', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to reset my password so that I can access my account again."

Acceptance Criteria: "The password reset should work correctly."', 1, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 1, 25),

('00000000-0000-0000-0000-000000000102', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to search for products so that I can quickly find what I need."

Acceptance Criteria: "Search results should appear quickly."', 1, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 2, 25),

('00000000-0000-0000-0000-000000000103', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to update my profile so that my information stays current."

Acceptance Criteria: "The profile page should look nice."', 1, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 3, 25),

('00000000-0000-0000-0000-000000000104', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to log in so that I can access my account."

Acceptance Criteria: "Login must always succeed."', 1, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 4, 25),

('00000000-0000-0000-0000-000000000105', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to place an order so that I can buy products online."

Acceptance Criteria: "The order page should be user-friendly."', 1, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 5, 25),

('00000000-0000-0000-0000-000000000106', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to contact support so that I can receive help."

Acceptance Criteria: "The support form should function properly."', 1, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 6, 25),

('00000000-0000-0000-0000-000000000107', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to cancel an order so that I can correct a mistake."

Acceptance Criteria: "Orders can be cancelled."', 2, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 7, 25),

('00000000-0000-0000-0000-000000000108', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to delete my account so that my personal information is removed."

Acceptance Criteria: "A red confirmation dialog with JavaScript animation is displayed."', 2, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 8, 25),

('00000000-0000-0000-0000-000000000109', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to search for products so that I can find them easily."

Acceptance Criteria:
- Search completes in under two seconds.
- Search returns relevant products.', 2, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 9, 25),

('00000000-0000-0000-0000-000000000110', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to download my invoices so that I can keep financial records."

Acceptance Criteria:
- Users can download invoices.
- The download is secure.', 2, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 10, 25),

('00000000-0000-0000-0000-000000000111', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to change my password so that my account remains secure."

Acceptance Criteria: "Passwords must be stored using bcrypt with cost factor 12."', 2, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 11, 25),

('00000000-0000-0000-0000-000000000112', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to view my order history so that I can track previous purchases."

Acceptance Criteria: "The page should load fast and look modern."', 2, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 12, 25),

('00000000-0000-0000-0000-000000000113', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to stay logged in so that I don''t have to sign in repeatedly."

Acceptance Criteria:
- Stay logged in for 30 days.
- Automatically log out after 15 minutes.
- Never log out automatically.', 3, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 13, 25),

('00000000-0000-0000-0000-000000000114', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to search for products so that I can find items quickly."

Acceptance Criteria:
- Elasticsearch is used.
- PostgreSQL indexes are configured.', 3, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 14, 25),

('00000000-0000-0000-0000-000000000115', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to update my email address so that I receive notifications."

Acceptance Criteria: "Email updates work correctly."', 3, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 15, 25),

('00000000-0000-0000-0000-000000000116', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to check out so that I can complete my purchase."

Acceptance Criteria:
- Payment succeeds.
- Confirmation email is sent.
- Inventory is updated.
- Loyalty points are awarded.
- Invoice is generated.
- Shipment is created.', 3, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 16, 25),

('00000000-0000-0000-0000-000000000117', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As an administrator, I want to manage users so that I can maintain the system."

Acceptance Criteria: "The interface should feel intuitive."', 3, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 17, 25),

('00000000-0000-0000-0000-000000000118', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to pay online so that I can complete purchases conveniently."

Acceptance Criteria: "The payment process should be secure, fast, modern, and reliable."', 3, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 18, 25);


-- =====================================================================
-- 2) ANSWERS
-- =====================================================================

-- Question 1 ("password reset should work correctly")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001011', 'The acceptance criterion is too vague.', 'Correct: "Should work correctly" gives no measurable or testable condition.', true),
('00000000-0000-0000-0001-000000001012', 'The acceptance criterion is too detailed.', 'Incorrect: the criterion is under-specified, not over-specified.', false),
('00000000-0000-0000-0001-000000001013', 'The acceptance criterion contains too many actors.', 'Incorrect: no actors are mentioned in the criterion at all.', false),
('00000000-0000-0000-0001-000000001014', 'The acceptance criterion is too long.', 'Incorrect: length is not the problem here; vagueness is.', false);

-- Question 2 ("Search results should appear quickly")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001021', '"Quickly" is not measurable.', 'Correct: without a concrete threshold (e.g. under 2 seconds), this cannot be objectively tested.', true),
('00000000-0000-0000-0001-000000001022', 'Too many acceptance criteria are defined.', 'Incorrect: only a single criterion is given.', false),
('00000000-0000-0000-0001-000000001023', 'The criterion contains implementation details.', 'Incorrect: no technology or implementation is mentioned.', false),
('00000000-0000-0000-0001-000000001024', 'The criterion contains multiple user stories.', 'Incorrect: it relates to a single user story.', false);

-- Question 3 ("profile page should look nice")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001031', 'The criterion is subjective.', 'Correct: "look nice" is a matter of opinion and cannot be objectively verified.', true),
('00000000-0000-0000-0001-000000001032', 'The criterion is too technical.', 'Incorrect: no technical detail is described.', false),
('00000000-0000-0000-0001-000000001033', 'The criterion contains multiple actors.', 'Incorrect: no actor is even mentioned in the criterion.', false),
('00000000-0000-0000-0001-000000001034', 'The criterion is too detailed.', 'Incorrect: the criterion is actually under-specified, not overly detailed.', false);

-- Question 4 ("Login must always succeed")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001041', 'The criterion is unrealistic.', 'Correct: no system can guarantee login "always" succeeds (e.g. wrong password, outages); this cannot be truthfully tested.', true),
('00000000-0000-0000-0001-000000001042', 'The criterion is too specific.', 'Incorrect: the criterion is in fact too broad/absolute, not overly specific.', false),
('00000000-0000-0000-0001-000000001043', 'The criterion contains implementation details.', 'Incorrect: no implementation is described.', false),
('00000000-0000-0000-0001-000000001044', 'The criterion is missing a title.', 'Incorrect: acceptance criteria don''t require a separate title field to be valid.', false);

-- Question 5 ("order page should be user-friendly")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001051', '"User-friendly" is subjective.', 'Correct: "user-friendly" has no objective, testable definition.', true),
('00000000-0000-0000-0001-000000001052', 'The criterion is too long.', 'Incorrect: the criterion is short, not long.', false),
('00000000-0000-0000-0001-000000001053', 'The criterion specifies implementation.', 'Incorrect: no technology or implementation is mentioned.', false),
('00000000-0000-0000-0001-000000001054', 'The criterion contains multiple stories.', 'Incorrect: it relates to a single user story.', false);

-- Question 6 ("support form should function properly")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001061', '"Properly" is too vague.', 'Correct: "properly" does not define any measurable or testable behavior.', true),
('00000000-0000-0000-0001-000000001062', 'The criterion is too technical.', 'Incorrect: no technical detail is described.', false),
('00000000-0000-0000-0001-000000001063', 'The criterion contains multiple actors.', 'Incorrect: no actor is mentioned in the criterion.', false),
('00000000-0000-0000-0001-000000001064', 'The criterion is too detailed.', 'Incorrect: the criterion is under-specified, not overly detailed.', false);

-- Question 7 ("Orders can be cancelled")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001071', 'Important business conditions are missing.', 'Correct: conditions such as deadlines, fees, or refund rules for cancellation are not defined.', true),
('00000000-0000-0000-0001-000000001072', 'The criterion is too technical.', 'Incorrect: no implementation or technology is mentioned.', false),
('00000000-0000-0000-0001-000000001073', 'The criterion is too detailed.', 'Incorrect: the criterion is under-specified, not overly detailed.', false),
('00000000-0000-0000-0001-000000001074', 'The criterion contains multiple actors.', 'Incorrect: no actor is mentioned at all.', false);

-- Question 8 ("red confirmation dialog with JavaScript animation")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001081', 'The criterion specifies implementation details.', 'Correct: describing a "red dialog" and "JavaScript animation" defines the technical solution rather than observable behavior.', true),
('00000000-0000-0000-0001-000000001082', 'The criterion is too vague.', 'Incorrect: the criterion is very specific, not vague.', false),
('00000000-0000-0000-0001-000000001083', 'The criterion is too short.', 'Incorrect: length is not the issue here.', false),
('00000000-0000-0000-0001-000000001084', 'The criterion contains multiple user stories.', 'Incorrect: it relates to a single user story.', false);

-- Question 9 (search: under two seconds / relevant products)
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001091', '"Relevant" is subjective.', 'Correct: "relevant" is not objectively defined or measurable, unlike the two-second criterion.', true),
('00000000-0000-0000-0001-000000001092', 'There are too many criteria.', 'Incorrect: two criteria for one story is a reasonable amount.', false),
('00000000-0000-0000-0001-000000001093', 'The criteria contain implementation details.', 'Incorrect: no technology or implementation is described.', false),
('00000000-0000-0000-0001-000000001094', 'The criteria are too technical.', 'Incorrect: the criteria describe outcomes, not technical solutions.', false);

-- Question 10 (download invoices: secure)
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001101', '"Secure" is not measurable.', 'Correct: "secure" has no defined, testable condition (e.g. encryption standard, authentication requirement).', true),
('00000000-0000-0000-0001-000000001102', 'The criteria are too detailed.', 'Incorrect: the criteria are actually under-specified.', false),
('00000000-0000-0000-0001-000000001103', 'Too many actors exist.', 'Incorrect: only the customer is involved.', false),
('00000000-0000-0000-0001-000000001104', 'The criteria describe implementation.', 'Incorrect: no specific technology or implementation is named.', false);

-- Question 11 ("bcrypt with cost factor 12")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001111', 'The criterion specifies implementation rather than behavior.', 'Correct: naming bcrypt and a specific cost factor describes a technical solution instead of an observable, user-facing outcome.', true),
('00000000-0000-0000-0001-000000001112', 'The criterion is too vague.', 'Incorrect: the criterion is highly specific, not vague.', false),
('00000000-0000-0000-0001-000000001113', 'The criterion contains multiple stories.', 'Incorrect: it relates to a single user story.', false),
('00000000-0000-0000-0001-000000001114', 'The criterion is too long.', 'Incorrect: length is not the core issue here.', false);

-- Question 12 ("load fast and look modern")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001121', 'The criteria contain subjective wording.', 'Correct: both "fast" and "modern" are subjective and lack measurable thresholds.', true),
('00000000-0000-0000-0001-000000001122', 'Too many acceptance criteria exist.', 'Incorrect: only one combined criterion is given.', false),
('00000000-0000-0000-0001-000000001123', 'The criteria are too detailed.', 'Incorrect: the criteria are under-specified, not overly detailed.', false),
('00000000-0000-0000-0001-000000001124', 'The criteria specify implementation.', 'Incorrect: no technology or implementation is described.', false);

-- Question 13 (contradicting login duration criteria)
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001131', 'The acceptance criteria contradict each other.', 'Correct: staying logged in for 30 days, auto-logout after 15 minutes, and never auto-logging out cannot all be true at once.', true),
('00000000-0000-0000-0001-000000001132', 'The criteria are too technical.', 'Incorrect: no technology or implementation is mentioned.', false),
('00000000-0000-0000-0001-000000001133', 'The criteria contain multiple actors.', 'Incorrect: only the customer is involved.', false),
('00000000-0000-0000-0001-000000001134', 'The criteria are too detailed.', 'Incorrect: the real issue is the contradiction, not the level of detail.', false);

-- Question 14 (Elasticsearch / PostgreSQL indexes)
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001141', 'The criteria describe implementation instead of observable behavior.', 'Correct: naming Elasticsearch and PostgreSQL indexes specifies the technical solution rather than a user-visible outcome.', true),
('00000000-0000-0000-0001-000000001142', 'The criteria are too vague.', 'Incorrect: the criteria are very specific, not vague.', false),
('00000000-0000-0000-0001-000000001143', 'The criteria are too short.', 'Incorrect: length is not the issue here.', false),
('00000000-0000-0000-0001-000000001144', 'The criteria contain multiple stories.', 'Incorrect: they relate to a single user story.', false);

-- Question 15 ("Email updates work correctly")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001151', 'The criterion cannot be objectively verified.', 'Correct: "work correctly" defines no concrete, testable condition.', true),
('00000000-0000-0000-0001-000000001152', 'The criterion is too detailed.', 'Incorrect: the criterion is under-specified, not overly detailed.', false),
('00000000-0000-0000-0001-000000001153', 'The criterion contains implementation.', 'Incorrect: no technology or implementation is described.', false),
('00000000-0000-0000-0001-000000001154', 'The criterion contains multiple actors.', 'Incorrect: no actor is mentioned in the criterion.', false);

-- Question 16 (6 unrelated checkout criteria)
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001161', 'The acceptance criteria cover multiple independent behaviors and may be too broad for a single story.', 'Correct: payment, email, inventory, loyalty points, invoicing, and shipment are largely independent concerns that likely belong to separate stories.', true),
('00000000-0000-0000-0001-000000001162', 'The criteria are too technical.', 'Incorrect: the criteria describe outcomes, not implementation.', false),
('00000000-0000-0000-0001-000000001163', 'The criteria are too short.', 'Incorrect: there are six criteria, which is not "too short".', false),
('00000000-0000-0000-0001-000000001164', 'The criteria contain multiple actors.', 'Incorrect: only the customer is involved.', false);

-- Question 17 ("interface should feel intuitive")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001171', '"Intuitive" is subjective and not measurable.', 'Correct: "intuitive" has no objective, testable definition.', true),
('00000000-0000-0000-0001-000000001172', 'The criterion is too detailed.', 'Incorrect: the criterion is under-specified, not overly detailed.', false),
('00000000-0000-0000-0001-000000001173', 'The criterion specifies implementation.', 'Incorrect: no technology or implementation is described.', false),
('00000000-0000-0000-0001-000000001174', 'The criterion contains multiple stories.', 'Incorrect: it relates to a single user story.', false);

-- Question 18 ("secure, fast, modern, and reliable")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001181', 'The criterion combines multiple subjective quality attributes that are not objectively testable.', 'Correct: "secure", "fast", "modern", and "reliable" are all vague quality terms without measurable thresholds.', true),
('00000000-0000-0000-0001-000000001182', 'The criterion contains implementation details.', 'Incorrect: no technology or implementation is mentioned.', false),
('00000000-0000-0000-0001-000000001183', 'The criterion is too short.', 'Incorrect: length is not the core issue here.', false),
('00000000-0000-0000-0001-000000001184', 'The criterion contains multiple actors.', 'Incorrect: only the customer is involved.', false);


-- =====================================================================
-- 3) QUESTION_TO_ANSWER (mapping)
-- =====================================================================

INSERT INTO question_to_answer (question_id, answer_id) VALUES
-- Q1
('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0001-000000001011'),
('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0001-000000001012'),
('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0001-000000001013'),
('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0001-000000001014'),
-- Q2
('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0001-000000001021'),
('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0001-000000001022'),
('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0001-000000001023'),
('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0001-000000001024'),
-- Q3
('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0001-000000001031'),
('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0001-000000001032'),
('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0001-000000001033'),
('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0001-000000001034'),
-- Q4
('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0001-000000001041'),
('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0001-000000001042'),
('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0001-000000001043'),
('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0001-000000001044'),
-- Q5
('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0001-000000001051'),
('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0001-000000001052'),
('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0001-000000001053'),
('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0001-000000001054'),
-- Q6
('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0001-000000001061'),
('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0001-000000001062'),
('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0001-000000001063'),
('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0001-000000001064'),
-- Q7
('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0001-000000001071'),
('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0001-000000001072'),
('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0001-000000001073'),
('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0001-000000001074'),
-- Q8
('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0001-000000001081'),
('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0001-000000001082'),
('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0001-000000001083'),
('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0001-000000001084'),
-- Q9
('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0001-000000001091'),
('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0001-000000001092'),
('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0001-000000001093'),
('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0001-000000001094'),
-- Q10
('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0001-000000001101'),
('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0001-000000001102'),
('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0001-000000001103'),
('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0001-000000001104'),
-- Q11
('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0001-000000001111'),
('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0001-000000001112'),
('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0001-000000001113'),
('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0001-000000001114'),
-- Q12
('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0001-000000001121'),
('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0001-000000001122'),
('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0001-000000001123'),
('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0001-000000001124'),
-- Q13
('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0001-000000001131'),
('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0001-000000001132'),
('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0001-000000001133'),
('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0001-000000001134'),
-- Q14
('00000000-0000-0000-0000-000000000114', '00000000-0000-0000-0001-000000001141'),
('00000000-0000-0000-0000-000000000114', '00000000-0000-0000-0001-000000001142'),
('00000000-0000-0000-0000-000000000114', '00000000-0000-0000-0001-000000001143'),
('00000000-0000-0000-0000-000000000114', '00000000-0000-0000-0001-000000001144'),
-- Q15
('00000000-0000-0000-0000-000000000115', '00000000-0000-0000-0001-000000001151'),
('00000000-0000-0000-0000-000000000115', '00000000-0000-0000-0001-000000001152'),
('00000000-0000-0000-0000-000000000115', '00000000-0000-0000-0001-000000001153'),
('00000000-0000-0000-0000-000000000115', '00000000-0000-0000-0001-000000001154'),
-- Q16
('00000000-0000-0000-0000-000000000116', '00000000-0000-0000-0001-000000001161'),
('00000000-0000-0000-0000-000000000116', '00000000-0000-0000-0001-000000001162'),
('00000000-0000-0000-0000-000000000116', '00000000-0000-0000-0001-000000001163'),
('00000000-0000-0000-0000-000000000116', '00000000-0000-0000-0001-000000001164'),
-- Q17
('00000000-0000-0000-0000-000000000117', '00000000-0000-0000-0001-000000001171'),
('00000000-0000-0000-0000-000000000117', '00000000-0000-0000-0001-000000001172'),
('00000000-0000-0000-0000-000000000117', '00000000-0000-0000-0001-000000001173'),
('00000000-0000-0000-0000-000000000117', '00000000-0000-0000-0001-000000001174'),
-- Q18
('00000000-0000-0000-0000-000000000118', '00000000-0000-0000-0001-000000001181'),
('00000000-0000-0000-0000-000000000118', '00000000-0000-0000-0001-000000001182'),
('00000000-0000-0000-0000-000000000118', '00000000-0000-0000-0001-000000001183'),
('00000000-0000-0000-0000-000000000118', '00000000-0000-0000-0001-000000001184');