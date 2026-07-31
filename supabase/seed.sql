-- =====================================================================
-- Seed data for the Type A question bank.
-- Run after supabase/schema.sql.
--
-- Two activities, 36 questions each (12 per difficulty level), 4 answer
-- options per question. Every question is worth 25 points, so a session
-- of 4 questions adds up to the max_score of 100 from REQ-DL-3.
--
-- UUID scheme (deterministic, collision-free IDs only):
--   Identify Weak User Stories
--     question(N)          -> 00000000-0000-0000-0000-0000000000NN   (N = 1..36)
--     answer(N, option i)  -> 00000000-0000-0000-0001-0000000000XX   (XX = N*10 + i)
--   Identify Weak Acceptance Criteria
--     question(N)          -> 00000000-0000-0000-0000-0000000001NN   (100 + N, N = 1..36)
--     answer(N, option i)  -> 00000000-0000-0000-0001-000000000XXX   (XXX = (100+N)*10 + i)
--   i: 1=A, 2=B, 3=C, 4=D
--
-- The offset keeps both activities collision-free in one database.
--
-- activity_type must match ACTIVITY_TYPES in lib/activityTypes.ts —
-- change both or the session draw finds an empty pool and returns 400.
--
-- To re-run: DELETE FROM question_to_answer; DELETE FROM answer;
--            DELETE FROM question;
-- (session_to_question and answered_question_log reference question, so
--  clear those first if any sessions exist.)
-- =====================================================================


-- #####################################################################
-- Activity: Identify Weak User Stories
-- #####################################################################

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

"As a customer, I want the online shop to be completely secure and extremely user-friendly so that I can shop without concerns."', 3, 'IDENTIFY_WEAK_USER_STORIES', 18, 25),

('00000000-0000-0000-0000-000000000019', 'Which is the primary weakness of the following user story?

"I want to view my order history so that I can check past purchases."', 1, 'IDENTIFY_WEAK_USER_STORIES', 19, 25),

('00000000-0000-0000-0000-000000000020', 'Which is the primary weakness of the following user story?

"As a customer, I want to receive a push notification."', 1, 'IDENTIFY_WEAK_USER_STORIES', 20, 25),

('00000000-0000-0000-0000-000000000021', 'Which is the primary weakness of the following user story?

"As a customer, I want the website to look better so that I enjoy shopping more."', 1, 'IDENTIFY_WEAK_USER_STORIES', 21, 25),

('00000000-0000-0000-0000-000000000022', 'Which is the primary weakness of the following user story?

"As a user, I want the app to load instantly every time so that I never have to wait."', 1, 'IDENTIFY_WEAK_USER_STORIES', 22, 25),

('00000000-0000-0000-0000-000000000023', 'Which is the primary weakness of the following user story?

"As a customer, I want the system to use Redis for caching so that pages load."', 1, 'IDENTIFY_WEAK_USER_STORIES', 23, 25),

('00000000-0000-0000-0000-000000000024', 'Which is the primary weakness of the following user story?

"As a developer, I want to reformat the code indentation so that it looks tidy."', 1, 'IDENTIFY_WEAK_USER_STORIES', 24, 25),

('00000000-0000-0000-0000-000000000025', 'Which is the primary weakness of the following user story?

"As a customer, I want to browse categories, filter products, read reviews, add items to my wishlist, and checkout so that I can complete my shopping."', 2, 'IDENTIFY_WEAK_USER_STORIES', 25, 25),

('00000000-0000-0000-0000-000000000026', 'Which is the primary weakness of the following user story?

"As a user, I want to approve refund requests so that customers get their money back."', 2, 'IDENTIFY_WEAK_USER_STORIES', 26, 25),

('00000000-0000-0000-0000-000000000027', 'Which is the primary weakness of the following user story?

"As a customer, I want the newsletter signup to be simple so that I can subscribe easily."', 2, 'IDENTIFY_WEAK_USER_STORIES', 27, 25),

('00000000-0000-0000-0000-000000000028', 'Which is the primary weakness of the following user story?

"As a customer, I want to return a product so that I can get a refund."', 2, 'IDENTIFY_WEAK_USER_STORIES', 28, 25),

('00000000-0000-0000-0000-000000000029', 'Which is the primary weakness of the following user story?

"As a customer, I want a blue ''Buy Now'' button rendered with React so that I can purchase quickly."', 2, 'IDENTIFY_WEAK_USER_STORIES', 29, 25),

('00000000-0000-0000-0000-000000000030', 'Which is the primary weakness of the following user story?

"As a customer, I want to upload a profile picture so that my account feels personal."

Acceptance Criterion: "The upload should work properly."', 2, 'IDENTIFY_WEAK_USER_STORIES', 30, 25),

('00000000-0000-0000-0000-000000000031', 'Which is the primary weakness of the following user story?

"As a customer, I want to see estimated delivery dates so that I know when my order will arrive."

(The delivery-date feature depends on an unfinished carrier-integration feature.)', 3, 'IDENTIFY_WEAK_USER_STORIES', 31, 25),

('00000000-0000-0000-0000-000000000032', 'Which is the primary weakness of the following user story?

"As a customer, I want the payment_log database table to be created so that transactions can later be recorded."', 3, 'IDENTIFY_WEAK_USER_STORIES', 32, 25),

('00000000-0000-0000-0000-000000000033', 'Which is the primary weakness of the following user story?

"As a customer, I want to filter products by price so that I can find items within my budget."

Acceptance Criteria:
- Results must include only items under $50.
- Results must include only items over $100.
- All items must always be shown regardless of the filter.', 3, 'IDENTIFY_WEAK_USER_STORIES', 33, 25),

('00000000-0000-0000-0000-000000000034', 'Which is the primary weakness of the following user story?

"As a customer, I want product images to be served via a CDN with WebP conversion and lazy-loading using IntersectionObserver so that pages load quickly."', 3, 'IDENTIFY_WEAK_USER_STORIES', 34, 25),

('00000000-0000-0000-0000-000000000035', 'Which is the primary weakness of the following user story?

"As a system administrator, I want the footer copyright text changed from a serif to a sans-serif font so that it looks marginally different."', 3, 'IDENTIFY_WEAK_USER_STORIES', 35, 25),

('00000000-0000-0000-0000-000000000036', 'Which is the primary weakness of the following user story?

"As a customer, I want the entire website to be extremely fast, beautifully designed, perfectly accessible, and completely bug-free so that I have the best possible experience."', 3, 'IDENTIFY_WEAK_USER_STORIES', 36, 25);


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

-- Question 19 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000191', 'The user role is missing.', 'Correct: the story does not start with "As a ...", so it is unclear who performs the action.', true),
('00000000-0000-0000-0001-000000000192', 'The business value is missing.', 'Incorrect: "so that I can check past purchases" states the value.', false),
('00000000-0000-0000-0001-000000000193', 'The story contains implementation details.', 'Incorrect: no technology is mentioned.', false),
('00000000-0000-0000-0001-000000000194', 'The story is too detailed.', 'Incorrect: the story is rather too short than too detailed.', false);

-- Question 20 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000201', 'The role is incorrect.', 'Incorrect: "customer" is an appropriate role here.', false),
('00000000-0000-0000-0001-000000000202', 'The business value ("so that...") is missing.', 'Correct: the "so that..." part explaining why the notification matters is missing.', true),
('00000000-0000-0000-0001-000000000203', 'The story contains multiple features.', 'Incorrect: only a single feature is described.', false),
('00000000-0000-0000-0001-000000000204', 'The story is too technical.', 'Incorrect: no technical details are mentioned.', false);

-- Question 21 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000211', 'The wording is too vague.', 'Correct: "better" is subjective and not measurable or testable.', true),
('00000000-0000-0000-0001-000000000212', 'The role is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000213', 'The story contains implementation details.', 'Incorrect: no specific technology is mentioned.', false),
('00000000-0000-0000-0001-000000000214', 'The story has too many acceptance criteria.', 'Incorrect: no acceptance criteria are given at all.', false);

-- Question 22 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000221', 'The expectation is unrealistic and not testable.', 'Correct: "instantly every time" and "never have to wait" cannot realistically be guaranteed or verified.', true),
('00000000-0000-0000-0001-000000000222', 'The story is missing a role.', 'Incorrect: the role "user" is stated.', false),
('00000000-0000-0000-0001-000000000223', 'The business value is missing.', 'Incorrect: "so that I never have to wait" states the value.', false),
('00000000-0000-0000-0001-000000000224', 'The story contains multiple actors.', 'Incorrect: only one actor (user) appears.', false);

-- Question 23 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000231', 'The story focuses on technical implementation instead of user value.', 'Correct: "Redis" is a concrete technical solution, not a user need.', true),
('00000000-0000-0000-0001-000000000232', 'The story contains multiple actors.', 'Incorrect: only one actor (customer) appears.', false),
('00000000-0000-0000-0001-000000000233', 'The role is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000234', 'The story is too short.', 'Incorrect: brevity is not the actual problem.', false);

-- Question 24 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000241', 'The story provides little business value.', 'Correct: a pure indentation reformat delivers no recognizable value to users or the business.', true),
('00000000-0000-0000-0001-000000000242', 'The story is missing a role.', 'Incorrect: "developer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000243', 'The story contains too many acceptance criteria.', 'Incorrect: no acceptance criteria are given.', false),
('00000000-0000-0000-0001-000000000244', 'The story is too detailed.', 'Incorrect: excessive detail is not the issue here.', false);

-- Question 25 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000251', 'The story should be split into smaller stories.', 'Correct: browsing, filtering, reading reviews, wishlisting, and checkout are several independent stories.', true),
('00000000-0000-0000-0001-000000000252', 'The role is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000253', 'The story is too short.', 'Incorrect: the story is rather too long / too broad.', false),
('00000000-0000-0000-0001-000000000254', 'The story contains no business value.', 'Incorrect: "so that I can complete my shopping" describes the value.', false);

-- Question 26 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000261', 'The user role is too generic.', 'Correct: "user" is too unspecific; a concrete role such as "support agent" would be better.', true),
('00000000-0000-0000-0001-000000000262', 'The story is too detailed.', 'Incorrect: the story is rather too coarse than too detailed.', false),
('00000000-0000-0000-0001-000000000263', 'The story contains technical implementation.', 'Incorrect: no specific technology is mentioned.', false),
('00000000-0000-0000-0001-000000000264', 'The business value is missing.', 'Incorrect: "so that customers get their money back" states the value.', false);

-- Question 27 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000271', '"Simple" and "easily" are not measurable.', 'Correct: without concrete criteria, these words cannot be objectively tested.', true),
('00000000-0000-0000-0001-000000000272', 'The story has no actor.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000273', 'The story contains implementation details.', 'Incorrect: no specific technology is mentioned.', false),
('00000000-0000-0000-0001-000000000274', 'The story is too long.', 'Incorrect: length is not the problem here.', false);

-- Question 28 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000281', 'Important business conditions are missing.', 'Correct: conditions such as the return window or the item''s required condition are missing.', true),
('00000000-0000-0000-0001-000000000282', 'The story is too technical.', 'Incorrect: no technology or implementation is mentioned.', false),
('00000000-0000-0000-0001-000000000283', 'The actor is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000284', 'The story contains too many goals.', 'Incorrect: only one goal (return) is described.', false);

-- Question 29 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000291', 'The story specifies UI and implementation details instead of user needs.', 'Correct: the button color and "rendered with React" describe the implementation rather than the actual need.', true),
('00000000-0000-0000-0001-000000000292', 'The story contains multiple actors.', 'Incorrect: only one actor (customer) appears.', false),
('00000000-0000-0000-0001-000000000293', 'The role is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000294', 'The story is too short.', 'Incorrect: the story is, on the contrary, quite detailed.', false);

-- Question 30 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000301', 'The acceptance criterion is too vague.', 'Correct: "should work properly" is not concretely measurable or testable.', true),
('00000000-0000-0000-0001-000000000302', 'The actor is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000303', 'The story contains implementation details.', 'Incorrect: no specific implementation is described.', false),
('00000000-0000-0000-0001-000000000304', 'The story contains multiple business values.', 'Incorrect: only one value is stated.', false);

-- Question 31 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000311', 'The story has a hidden dependency.', 'Correct: the story depends on a still-unfinished carrier-integration feature, which is not visible from the story itself.', true),
('00000000-0000-0000-0001-000000000312', 'The story is too short.', 'Incorrect: length is not the problem here.', false),
('00000000-0000-0000-0001-000000000313', 'The role is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000314', 'The business value is missing.', 'Incorrect: "so that I know when my order will arrive" describes the value.', false);

-- Question 32 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000321', 'The story is sliced by technical implementation instead of user value.', 'Correct: the story is defined around a database table rather than a user-visible outcome.', true),
('00000000-0000-0000-0001-000000000322', 'The role is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000323', 'The story is too long.', 'Incorrect: the story is rather short and simple.', false),
('00000000-0000-0000-0001-000000000324', 'The story contains multiple actors.', 'Incorrect: only one actor (customer) appears.', false);

-- Question 33 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000331', 'The acceptance criteria contradict each other.', 'Correct: "only under $50", "only over $100", and "always show all items" cannot all hold at once.', true),
('00000000-0000-0000-0001-000000000332', 'The story is missing a role.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000333', 'The story is too technical.', 'Incorrect: no specific technology is mentioned.', false),
('00000000-0000-0000-0001-000000000334', 'The business value is unclear.', 'Incorrect: "so that I can find items within my budget" is clearly stated.', false);

-- Question 34 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000341', 'The story specifies implementation details instead of user needs.', 'Correct: CDN, WebP conversion, and IntersectionObserver describe a technical solution rather than a user need.', true),
('00000000-0000-0000-0001-000000000342', 'The actor is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000343', 'The story is too short.', 'Incorrect: the story is, on the contrary, very detailed.', false),
('00000000-0000-0000-0001-000000000344', 'The business value is missing.', 'Incorrect: "so that pages load quickly" describes the value.', false);

-- Question 35 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000351', 'The story delivers little meaningful business value.', 'Correct: swapping the footer font provides virtually no relevant value.', true),
('00000000-0000-0000-0001-000000000352', 'The story is missing a role.', 'Incorrect: "system administrator" is stated as the role.', false),
('00000000-0000-0000-0001-000000000353', 'The story contains multiple features.', 'Incorrect: only a single, very small change is described.', false),
('00000000-0000-0000-0001-000000000354', 'The business value is missing.', 'Incorrect: "so that it looks marginally different" is stated, even if it is a weak value.', false);

-- Question 36 -------------------------------------------------------
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000000361', 'The quality goals are subjective and not measurable.', 'Correct: "extremely fast", "beautifully designed", "perfectly accessible", and "completely bug-free" cannot be objectively measured or tested.', true),
('00000000-0000-0000-0001-000000000362', 'The actor is missing.', 'Incorrect: "customer" is stated as the role.', false),
('00000000-0000-0000-0001-000000000363', 'The story contains multiple actors.', 'Incorrect: only one actor (customer) appears.', false),
('00000000-0000-0000-0001-000000000364', 'The story is too short.', 'Incorrect: length is not the problem here.', false);


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
('00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0001-000000000184'),
-- Q19
('00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0001-000000000191'),
('00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0001-000000000192'),
('00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0001-000000000193'),
('00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0001-000000000194'),
-- Q20
('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0001-000000000201'),
('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0001-000000000202'),
('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0001-000000000203'),
('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0001-000000000204'),
-- Q21
('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0001-000000000211'),
('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0001-000000000212'),
('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0001-000000000213'),
('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0001-000000000214'),
-- Q22
('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0001-000000000221'),
('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0001-000000000222'),
('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0001-000000000223'),
('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0001-000000000224'),
-- Q23
('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0001-000000000231'),
('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0001-000000000232'),
('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0001-000000000233'),
('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0001-000000000234'),
-- Q24
('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0001-000000000241'),
('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0001-000000000242'),
('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0001-000000000243'),
('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0001-000000000244'),
-- Q25
('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0001-000000000251'),
('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0001-000000000252'),
('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0001-000000000253'),
('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0001-000000000254'),
-- Q26
('00000000-0000-0000-0000-000000000026', '00000000-0000-0000-0001-000000000261'),
('00000000-0000-0000-0000-000000000026', '00000000-0000-0000-0001-000000000262'),
('00000000-0000-0000-0000-000000000026', '00000000-0000-0000-0001-000000000263'),
('00000000-0000-0000-0000-000000000026', '00000000-0000-0000-0001-000000000264'),
-- Q27
('00000000-0000-0000-0000-000000000027', '00000000-0000-0000-0001-000000000271'),
('00000000-0000-0000-0000-000000000027', '00000000-0000-0000-0001-000000000272'),
('00000000-0000-0000-0000-000000000027', '00000000-0000-0000-0001-000000000273'),
('00000000-0000-0000-0000-000000000027', '00000000-0000-0000-0001-000000000274'),
-- Q28
('00000000-0000-0000-0000-000000000028', '00000000-0000-0000-0001-000000000281'),
('00000000-0000-0000-0000-000000000028', '00000000-0000-0000-0001-000000000282'),
('00000000-0000-0000-0000-000000000028', '00000000-0000-0000-0001-000000000283'),
('00000000-0000-0000-0000-000000000028', '00000000-0000-0000-0001-000000000284'),
-- Q29
('00000000-0000-0000-0000-000000000029', '00000000-0000-0000-0001-000000000291'),
('00000000-0000-0000-0000-000000000029', '00000000-0000-0000-0001-000000000292'),
('00000000-0000-0000-0000-000000000029', '00000000-0000-0000-0001-000000000293'),
('00000000-0000-0000-0000-000000000029', '00000000-0000-0000-0001-000000000294'),
-- Q30
('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0001-000000000301'),
('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0001-000000000302'),
('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0001-000000000303'),
('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0001-000000000304'),
-- Q31
('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0001-000000000311'),
('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0001-000000000312'),
('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0001-000000000313'),
('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0001-000000000314'),
-- Q32
('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0001-000000000321'),
('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0001-000000000322'),
('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0001-000000000323'),
('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0001-000000000324'),
-- Q33
('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0001-000000000331'),
('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0001-000000000332'),
('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0001-000000000333'),
('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0001-000000000334'),
-- Q34
('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0001-000000000341'),
('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0001-000000000342'),
('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0001-000000000343'),
('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0001-000000000344'),
-- Q35
('00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0001-000000000351'),
('00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0001-000000000352'),
('00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0001-000000000353'),
('00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0001-000000000354'),
-- Q36
('00000000-0000-0000-0000-000000000036', '00000000-0000-0000-0001-000000000361'),
('00000000-0000-0000-0000-000000000036', '00000000-0000-0000-0001-000000000362'),
('00000000-0000-0000-0000-000000000036', '00000000-0000-0000-0001-000000000363'),
('00000000-0000-0000-0000-000000000036', '00000000-0000-0000-0001-000000000364');


-- #####################################################################
-- Activity: Identify Weak Acceptance Criteria
-- #####################################################################

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

Acceptance Criteria: "The payment process should be secure, fast, modern, and reliable."', 3, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 18, 25),

('00000000-0000-0000-0000-000000000119', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to track my order so that I know its status."

Acceptance Criteria: "Order tracking should work well."', 1, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 19, 25),

('00000000-0000-0000-0000-000000000120', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to filter search results so that I can narrow down options."

Acceptance Criteria: "Filtering should be quick."', 1, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 20, 25),

('00000000-0000-0000-0000-000000000121', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to view product photos so that I can see what I am buying."

Acceptance Criteria: "The photo gallery should look great."', 1, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 21, 25),

('00000000-0000-0000-0000-000000000122', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to submit a review so that I can share my experience."

Acceptance Criteria: "Review submission must never fail."', 1, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 22, 25),

('00000000-0000-0000-0000-000000000123', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to browse the homepage so that I can discover products."

Acceptance Criteria: "The homepage should be appealing."', 1, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 23, 25),

('00000000-0000-0000-0000-000000000124', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to apply a discount code so that I pay less."

Acceptance Criteria: "The discount code feature should function properly."', 1, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 24, 25),

('00000000-0000-0000-0000-000000000125', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to return a product so that I can get a refund."

Acceptance Criteria: "Returns are accepted."', 2, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 25, 25),

('00000000-0000-0000-0000-000000000126', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to unsubscribe from emails so that I stop receiving marketing."

Acceptance Criteria: "A green confirmation banner slides in using CSS animations."', 2, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 26, 25),

('00000000-0000-0000-0000-000000000127', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to filter products by category so that I can narrow results."

Acceptance Criteria:
- Filtering completes in under one second.
- Filtered results are useful.', 2, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 27, 25),

('00000000-0000-0000-0000-000000000128', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to export my data so that I can keep a personal copy."

Acceptance Criteria:
- Users can export their data.
- The export is safe.', 2, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 28, 25),

('00000000-0000-0000-0000-000000000129', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to enable two-factor authentication so that my account is protected."

Acceptance Criteria: "TOTP codes must be generated using HMAC-SHA1 with a 30-second time step per RFC 6238."', 2, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 29, 25),

('00000000-0000-0000-0000-000000000130', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to view my saved addresses so that I can reuse them at checkout."

Acceptance Criteria: "The address list should load fast and look clean."', 2, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 30, 25),

('00000000-0000-0000-0000-000000000131', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to set a delivery time window so that I know when to expect my package."

Acceptance Criteria:
- The delivery window can be changed until 1 hour before delivery.
- The delivery window cannot be changed once set.
- The delivery window can always be changed, even after delivery.', 3, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 31, 25),

('00000000-0000-0000-0000-000000000132', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to receive product recommendations so that I can discover new items."

Acceptance Criteria:
- Recommendations are generated using a collaborative-filtering model hosted on AWS SageMaker.
- Results are cached in Redis with a 10-minute TTL.', 3, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 32, 25),

('00000000-0000-0000-0000-000000000133', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to merge duplicate accounts so that I have a single profile."

Acceptance Criteria: "Account merging works correctly."', 3, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 33, 25),

('00000000-0000-0000-0000-000000000134', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to complete registration so that I can create an account."

Acceptance Criteria:
- Email is verified.
- Welcome email is sent.
- Loyalty account is created.
- Referral bonus is applied.
- Newsletter preference is set.
- Analytics event is logged.', 3, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 34, 25),

('00000000-0000-0000-0000-000000000135', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As an administrator, I want to review flagged content so that I can moderate the platform."

Acceptance Criteria: "The moderation dashboard should feel intuitive."', 3, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 35, 25),

('00000000-0000-0000-0000-000000000136', 'Which is the primary weakness of the following acceptance criteria?

User Story: "As a customer, I want to schedule a recurring order so that I do not have to reorder manually."

Acceptance Criteria: "Scheduling should be fast, flexible, reliable, and easy to use."', 3, 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 36, 25);


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

-- Question 19 ("Order tracking should work well")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001191', 'The acceptance criterion is too vague.', 'Correct: "work well" gives no measurable or testable condition.', true),
('00000000-0000-0000-0001-000000001192', 'The acceptance criterion is too detailed.', 'Incorrect: the criterion is under-specified, not over-specified.', false),
('00000000-0000-0000-0001-000000001193', 'The acceptance criterion contains too many actors.', 'Incorrect: no actors are mentioned in the criterion at all.', false),
('00000000-0000-0000-0001-000000001194', 'The acceptance criterion is too long.', 'Incorrect: length is not the problem here; vagueness is.', false);

-- Question 20 ("Filtering should be quick")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001201', '"Quick" is not measurable.', 'Correct: without a concrete threshold (e.g. under 1 second), this cannot be objectively tested.', true),
('00000000-0000-0000-0001-000000001202', 'Too many acceptance criteria are defined.', 'Incorrect: only a single criterion is given.', false),
('00000000-0000-0000-0001-000000001203', 'The criterion contains implementation details.', 'Incorrect: no technology or implementation is mentioned.', false),
('00000000-0000-0000-0001-000000001204', 'The criterion contains multiple user stories.', 'Incorrect: it relates to a single user story.', false);

-- Question 21 ("photo gallery should look great")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001211', 'The criterion is subjective.', 'Correct: "look great" is a matter of opinion and cannot be objectively verified.', true),
('00000000-0000-0000-0001-000000001212', 'The criterion is too technical.', 'Incorrect: no technical detail is described.', false),
('00000000-0000-0000-0001-000000001213', 'The criterion contains multiple actors.', 'Incorrect: no actor is even mentioned in the criterion.', false),
('00000000-0000-0000-0001-000000001214', 'The criterion is too detailed.', 'Incorrect: the criterion is actually under-specified, not overly detailed.', false);

-- Question 22 ("Review submission must never fail")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001221', 'The criterion is unrealistic.', 'Correct: no system can guarantee submission "never" fails (e.g. network outages); this cannot be truthfully tested.', true),
('00000000-0000-0000-0001-000000001222', 'The criterion is too specific.', 'Incorrect: the criterion is in fact too broad/absolute, not overly specific.', false),
('00000000-0000-0000-0001-000000001223', 'The criterion contains implementation details.', 'Incorrect: no implementation is described.', false),
('00000000-0000-0000-0001-000000001224', 'The criterion is missing a title.', 'Incorrect: acceptance criteria don''t require a separate title field to be valid.', false);

-- Question 23 ("homepage should be appealing")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001231', '"Appealing" is subjective.', 'Correct: "appealing" has no objective, testable definition.', true),
('00000000-0000-0000-0001-000000001232', 'The criterion is too long.', 'Incorrect: the criterion is short, not long.', false),
('00000000-0000-0000-0001-000000001233', 'The criterion specifies implementation.', 'Incorrect: no technology or implementation is mentioned.', false),
('00000000-0000-0000-0001-000000001234', 'The criterion contains multiple stories.', 'Incorrect: it relates to a single user story.', false);

-- Question 24 ("discount code feature should function properly")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001241', '"Properly" is too vague.', 'Correct: "properly" does not define any measurable or testable behavior.', true),
('00000000-0000-0000-0001-000000001242', 'The criterion is too technical.', 'Incorrect: no technical detail is described.', false),
('00000000-0000-0000-0001-000000001243', 'The criterion contains multiple actors.', 'Incorrect: no actor is mentioned in the criterion.', false),
('00000000-0000-0000-0001-000000001244', 'The criterion is too detailed.', 'Incorrect: the criterion is under-specified, not overly detailed.', false);

-- Question 25 ("Returns are accepted")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001251', 'Important business conditions are missing.', 'Correct: conditions such as the return window or the item''s required condition are not defined.', true),
('00000000-0000-0000-0001-000000001252', 'The criterion is too technical.', 'Incorrect: no implementation or technology is mentioned.', false),
('00000000-0000-0000-0001-000000001253', 'The criterion is too detailed.', 'Incorrect: the criterion is under-specified, not overly detailed.', false),
('00000000-0000-0000-0001-000000001254', 'The criterion contains multiple actors.', 'Incorrect: no actor is mentioned at all.', false);

-- Question 26 ("green confirmation banner slides in using CSS animations")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001261', 'The criterion specifies implementation details.', 'Correct: describing a "green banner" and "CSS animations" defines the technical solution rather than observable behavior.', true),
('00000000-0000-0000-0001-000000001262', 'The criterion is too vague.', 'Incorrect: the criterion is very specific, not vague.', false),
('00000000-0000-0000-0001-000000001263', 'The criterion is too short.', 'Incorrect: length is not the issue here.', false),
('00000000-0000-0000-0001-000000001264', 'The criterion contains multiple user stories.', 'Incorrect: it relates to a single user story.', false);

-- Question 27 (filter: under one second / results are useful)
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001271', '"Useful" is subjective.', 'Correct: "useful" is not objectively defined or measurable, unlike the one-second criterion.', true),
('00000000-0000-0000-0001-000000001272', 'There are too many criteria.', 'Incorrect: two criteria for one story is a reasonable amount.', false),
('00000000-0000-0000-0001-000000001273', 'The criteria contain implementation details.', 'Incorrect: no technology or implementation is described.', false),
('00000000-0000-0000-0001-000000001274', 'The criteria are too technical.', 'Incorrect: the criteria describe outcomes, not technical solutions.', false);

-- Question 28 (export: users can export / the export is safe)
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001281', '"Safe" is not measurable.', 'Correct: "safe" has no defined, testable condition (e.g. encryption standard, access control requirement).', true),
('00000000-0000-0000-0001-000000001282', 'The criteria are too detailed.', 'Incorrect: the criteria are actually under-specified.', false),
('00000000-0000-0000-0001-000000001283', 'Too many actors exist.', 'Incorrect: only the customer is involved.', false),
('00000000-0000-0000-0001-000000001284', 'The criteria describe implementation.', 'Incorrect: no specific technology or implementation is named.', false);

-- Question 29 ("TOTP codes via HMAC-SHA1, 30-second step, RFC 6238")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001291', 'The criterion specifies implementation rather than behavior.', 'Correct: naming the exact algorithm, hash function, and time step describes a technical solution instead of an observable, user-facing outcome.', true),
('00000000-0000-0000-0001-000000001292', 'The criterion is too vague.', 'Incorrect: the criterion is highly specific, not vague.', false),
('00000000-0000-0000-0001-000000001293', 'The criterion contains multiple stories.', 'Incorrect: it relates to a single user story.', false),
('00000000-0000-0000-0001-000000001294', 'The criterion is too long.', 'Incorrect: length is not the core issue here.', false);

-- Question 30 ("load fast and look clean")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001301', 'The criteria contain subjective wording.', 'Correct: both "fast" and "clean" are subjective and lack measurable thresholds.', true),
('00000000-0000-0000-0001-000000001302', 'Too many acceptance criteria exist.', 'Incorrect: only one combined criterion is given.', false),
('00000000-0000-0000-0001-000000001303', 'The criteria are too detailed.', 'Incorrect: the criteria are under-specified, not overly detailed.', false),
('00000000-0000-0000-0001-000000001304', 'The criteria specify implementation.', 'Incorrect: no technology or implementation is described.', false);

-- Question 31 (contradicting delivery-window criteria)
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001311', 'The acceptance criteria contradict each other.', 'Correct: allowing changes until 1 hour before delivery, forbidding changes once set, and always allowing changes cannot all be true at once.', true),
('00000000-0000-0000-0001-000000001312', 'The criteria are too technical.', 'Incorrect: no technology or implementation is mentioned.', false),
('00000000-0000-0000-0001-000000001313', 'The criteria contain multiple actors.', 'Incorrect: only the customer is involved.', false),
('00000000-0000-0000-0001-000000001314', 'The criteria are too detailed.', 'Incorrect: the real issue is the contradiction, not the level of detail.', false);

-- Question 32 (SageMaker collaborative filtering / Redis TTL)
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001321', 'The criteria describe implementation instead of observable behavior.', 'Correct: naming the specific model, hosting platform, and caching strategy specifies the technical solution rather than a user-visible outcome.', true),
('00000000-0000-0000-0001-000000001322', 'The criteria are too vague.', 'Incorrect: the criteria are very specific, not vague.', false),
('00000000-0000-0000-0001-000000001323', 'The criteria are too short.', 'Incorrect: length is not the issue here.', false),
('00000000-0000-0000-0001-000000001324', 'The criteria contain multiple stories.', 'Incorrect: they relate to a single user story.', false);

-- Question 33 ("Account merging works correctly")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001331', 'The criterion cannot be objectively verified.', 'Correct: "works correctly" defines no concrete, testable condition.', true),
('00000000-0000-0000-0001-000000001332', 'The criterion is too detailed.', 'Incorrect: the criterion is under-specified, not overly detailed.', false),
('00000000-0000-0000-0001-000000001333', 'The criterion contains implementation.', 'Incorrect: no technology or implementation is described.', false),
('00000000-0000-0000-0001-000000001334', 'The criterion contains multiple actors.', 'Incorrect: no actor is mentioned in the criterion.', false);

-- Question 34 (6 unrelated registration criteria)
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001341', 'The acceptance criteria cover multiple independent behaviors and may be too broad for a single story.', 'Correct: email verification, welcome email, loyalty account, referral bonus, newsletter preference, and analytics are largely independent concerns that likely belong to separate stories.', true),
('00000000-0000-0000-0001-000000001342', 'The criteria are too technical.', 'Incorrect: the criteria describe outcomes, not implementation.', false),
('00000000-0000-0000-0001-000000001343', 'The criteria are too short.', 'Incorrect: there are six criteria, which is not "too short".', false),
('00000000-0000-0000-0001-000000001344', 'The criteria contain multiple actors.', 'Incorrect: only the customer is involved.', false);

-- Question 35 ("moderation dashboard should feel intuitive")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001351', '"Intuitive" is subjective and not measurable.', 'Correct: "intuitive" has no objective, testable definition.', true),
('00000000-0000-0000-0001-000000001352', 'The criterion is too detailed.', 'Incorrect: the criterion is under-specified, not overly detailed.', false),
('00000000-0000-0000-0001-000000001353', 'The criterion specifies implementation.', 'Incorrect: no technology or implementation is described.', false),
('00000000-0000-0000-0001-000000001354', 'The criterion contains multiple stories.', 'Incorrect: it relates to a single user story.', false);

-- Question 36 ("fast, flexible, reliable, and easy to use")
INSERT INTO answer (answer_id, option_text, explanation, is_correct) VALUES
('00000000-0000-0000-0001-000000001361', 'The criterion combines multiple subjective quality attributes that are not objectively testable.', 'Correct: "fast", "flexible", "reliable", and "easy to use" are all vague quality terms without measurable thresholds.', true),
('00000000-0000-0000-0001-000000001362', 'The criterion contains implementation details.', 'Incorrect: no technology or implementation is mentioned.', false),
('00000000-0000-0000-0001-000000001363', 'The criterion is too short.', 'Incorrect: length is not the core issue here.', false),
('00000000-0000-0000-0001-000000001364', 'The criterion contains multiple actors.', 'Incorrect: only the customer is involved.', false);


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
('00000000-0000-0000-0000-000000000118', '00000000-0000-0000-0001-000000001184'),
-- Q19
('00000000-0000-0000-0000-000000000119', '00000000-0000-0000-0001-000000001191'),
('00000000-0000-0000-0000-000000000119', '00000000-0000-0000-0001-000000001192'),
('00000000-0000-0000-0000-000000000119', '00000000-0000-0000-0001-000000001193'),
('00000000-0000-0000-0000-000000000119', '00000000-0000-0000-0001-000000001194'),
-- Q20
('00000000-0000-0000-0000-000000000120', '00000000-0000-0000-0001-000000001201'),
('00000000-0000-0000-0000-000000000120', '00000000-0000-0000-0001-000000001202'),
('00000000-0000-0000-0000-000000000120', '00000000-0000-0000-0001-000000001203'),
('00000000-0000-0000-0000-000000000120', '00000000-0000-0000-0001-000000001204'),
-- Q21
('00000000-0000-0000-0000-000000000121', '00000000-0000-0000-0001-000000001211'),
('00000000-0000-0000-0000-000000000121', '00000000-0000-0000-0001-000000001212'),
('00000000-0000-0000-0000-000000000121', '00000000-0000-0000-0001-000000001213'),
('00000000-0000-0000-0000-000000000121', '00000000-0000-0000-0001-000000001214'),
-- Q22
('00000000-0000-0000-0000-000000000122', '00000000-0000-0000-0001-000000001221'),
('00000000-0000-0000-0000-000000000122', '00000000-0000-0000-0001-000000001222'),
('00000000-0000-0000-0000-000000000122', '00000000-0000-0000-0001-000000001223'),
('00000000-0000-0000-0000-000000000122', '00000000-0000-0000-0001-000000001224'),
-- Q23
('00000000-0000-0000-0000-000000000123', '00000000-0000-0000-0001-000000001231'),
('00000000-0000-0000-0000-000000000123', '00000000-0000-0000-0001-000000001232'),
('00000000-0000-0000-0000-000000000123', '00000000-0000-0000-0001-000000001233'),
('00000000-0000-0000-0000-000000000123', '00000000-0000-0000-0001-000000001234'),
-- Q24
('00000000-0000-0000-0000-000000000124', '00000000-0000-0000-0001-000000001241'),
('00000000-0000-0000-0000-000000000124', '00000000-0000-0000-0001-000000001242'),
('00000000-0000-0000-0000-000000000124', '00000000-0000-0000-0001-000000001243'),
('00000000-0000-0000-0000-000000000124', '00000000-0000-0000-0001-000000001244'),
-- Q25
('00000000-0000-0000-0000-000000000125', '00000000-0000-0000-0001-000000001251'),
('00000000-0000-0000-0000-000000000125', '00000000-0000-0000-0001-000000001252'),
('00000000-0000-0000-0000-000000000125', '00000000-0000-0000-0001-000000001253'),
('00000000-0000-0000-0000-000000000125', '00000000-0000-0000-0001-000000001254'),
-- Q26
('00000000-0000-0000-0000-000000000126', '00000000-0000-0000-0001-000000001261'),
('00000000-0000-0000-0000-000000000126', '00000000-0000-0000-0001-000000001262'),
('00000000-0000-0000-0000-000000000126', '00000000-0000-0000-0001-000000001263'),
('00000000-0000-0000-0000-000000000126', '00000000-0000-0000-0001-000000001264'),
-- Q27
('00000000-0000-0000-0000-000000000127', '00000000-0000-0000-0001-000000001271'),
('00000000-0000-0000-0000-000000000127', '00000000-0000-0000-0001-000000001272'),
('00000000-0000-0000-0000-000000000127', '00000000-0000-0000-0001-000000001273'),
('00000000-0000-0000-0000-000000000127', '00000000-0000-0000-0001-000000001274'),
-- Q28
('00000000-0000-0000-0000-000000000128', '00000000-0000-0000-0001-000000001281'),
('00000000-0000-0000-0000-000000000128', '00000000-0000-0000-0001-000000001282'),
('00000000-0000-0000-0000-000000000128', '00000000-0000-0000-0001-000000001283'),
('00000000-0000-0000-0000-000000000128', '00000000-0000-0000-0001-000000001284'),
-- Q29
('00000000-0000-0000-0000-000000000129', '00000000-0000-0000-0001-000000001291'),
('00000000-0000-0000-0000-000000000129', '00000000-0000-0000-0001-000000001292'),
('00000000-0000-0000-0000-000000000129', '00000000-0000-0000-0001-000000001293'),
('00000000-0000-0000-0000-000000000129', '00000000-0000-0000-0001-000000001294'),
-- Q30
('00000000-0000-0000-0000-000000000130', '00000000-0000-0000-0001-000000001301'),
('00000000-0000-0000-0000-000000000130', '00000000-0000-0000-0001-000000001302'),
('00000000-0000-0000-0000-000000000130', '00000000-0000-0000-0001-000000001303'),
('00000000-0000-0000-0000-000000000130', '00000000-0000-0000-0001-000000001304'),
-- Q31
('00000000-0000-0000-0000-000000000131', '00000000-0000-0000-0001-000000001311'),
('00000000-0000-0000-0000-000000000131', '00000000-0000-0000-0001-000000001312'),
('00000000-0000-0000-0000-000000000131', '00000000-0000-0000-0001-000000001313'),
('00000000-0000-0000-0000-000000000131', '00000000-0000-0000-0001-000000001314'),
-- Q32
('00000000-0000-0000-0000-000000000132', '00000000-0000-0000-0001-000000001321'),
('00000000-0000-0000-0000-000000000132', '00000000-0000-0000-0001-000000001322'),
('00000000-0000-0000-0000-000000000132', '00000000-0000-0000-0001-000000001323'),
('00000000-0000-0000-0000-000000000132', '00000000-0000-0000-0001-000000001324'),
-- Q33
('00000000-0000-0000-0000-000000000133', '00000000-0000-0000-0001-000000001331'),
('00000000-0000-0000-0000-000000000133', '00000000-0000-0000-0001-000000001332'),
('00000000-0000-0000-0000-000000000133', '00000000-0000-0000-0001-000000001333'),
('00000000-0000-0000-0000-000000000133', '00000000-0000-0000-0001-000000001334'),
-- Q34
('00000000-0000-0000-0000-000000000134', '00000000-0000-0000-0001-000000001341'),
('00000000-0000-0000-0000-000000000134', '00000000-0000-0000-0001-000000001342'),
('00000000-0000-0000-0000-000000000134', '00000000-0000-0000-0001-000000001343'),
('00000000-0000-0000-0000-000000000134', '00000000-0000-0000-0001-000000001344'),
-- Q35
('00000000-0000-0000-0000-000000000135', '00000000-0000-0000-0001-000000001351'),
('00000000-0000-0000-0000-000000000135', '00000000-0000-0000-0001-000000001352'),
('00000000-0000-0000-0000-000000000135', '00000000-0000-0000-0001-000000001353'),
('00000000-0000-0000-0000-000000000135', '00000000-0000-0000-0001-000000001354'),
-- Q36
('00000000-0000-0000-0000-000000000136', '00000000-0000-0000-0001-000000001361'),
('00000000-0000-0000-0000-000000000136', '00000000-0000-0000-0001-000000001362'),
('00000000-0000-0000-0000-000000000136', '00000000-0000-0000-0001-000000001363'),
('00000000-0000-0000-0000-000000000136', '00000000-0000-0000-0001-000000001364');


-- #####################################################################
-- REQ-GAM-DL-2: Title Definitions
--
-- One title per (activity_type, difficulty_level), per the acceptance
-- criteria design table.
--
-- To re-run: DELETE FROM title_definition;
-- #####################################################################

INSERT INTO title_definition (title_definition_id, activity_type, difficulty_level, title_name) VALUES
('00000000-0000-0000-0002-000000000001', 'IDENTIFY_WEAK_USER_STORIES', 1, 'Story Apprentice'),
('00000000-0000-0000-0002-000000000002', 'IDENTIFY_WEAK_USER_STORIES', 2, 'Story Analyst'),
('00000000-0000-0000-0002-000000000003', 'IDENTIFY_WEAK_USER_STORIES', 3, 'Story Expert'),
('00000000-0000-0000-0002-000000000004', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 1, 'Criteria Apprentice'),
('00000000-0000-0000-0002-000000000005', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 2, 'Criteria Analyst'),
('00000000-0000-0000-0002-000000000006', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 3, 'Criteria Expert');
