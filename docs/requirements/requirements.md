# Training Ground Platform

## Purpose

The application will be a browser-based application that helps undergraduate computer science students practice writing and analyzing software requirements. The application will focus especially on user stories, so when this document refers to requirements, it generally means user stories written by or evaluated by students.

The goal of the application is not primarily to teach lessons on requirements, but to provide students with practice activities that help them improve their ability to recognize, write, evaluate, and revise user stories.

Gamification elements are incorporated to increase activity engagement.

## Introduction

### Activities and User Interface

- An activity is a student exercise.  Some activities make include repeated tasks, for example, answering a multiple-choice questions. All activities have a full score of 100 points.
- When the student selects an activity to do, the student sees an opening page that gives instructions on the activity.
- The opening page also shows the highest score the student has achieved in this activity, along with a list of prior results for the activity.
- The student can hit a button to start a new activity, or to continue an activity that was not completed.
- After completing the activity, the user is left at the opening page with updated results.

### Different Types of Activities
As the features of this application expand, there will be multiple types of activities that the students can do.  The initial implementation will focus on "Type A" activities which present a bank of questions to the user.  Each question has one answer that receives full points; other answers might receive partial points.  Other activities might be added to the app as well but with a different structure than Type A activities, for example, free-form questions.

#### What Is a Type A Activity?

A Type A activity presents the student with a prompt (e.g., a user story, or a scenario) along with a fixed set of pre-authored answer options. Only one option can be chosen by the user for each question.Each option has a known, stored score and a stored explanation. The student selects a single option, and the application uses the pre-authored data to score the attempt and display feedback — no AI evaluation is needed at attempt time.

Examples of Type A activities include "Identify Weak User Stories" and "Identify Weak Acceptance Criteria" (identifying the single weakest acceptance criterion from a list).

The questions are stored in a question bank.  Each question has a difficulty rating (1=easy, 2=medium, 3=hard). Students start at the easy level.  The student is given 4 random questions from the bank at that level.  Each question is worth 25 points at most.  If the student has a cummulative score of 75% on the questions, then the student can advance to the next level of difficult.  Otherwise, the student must repeat the level before advancing by trying a new version of the quiz with a newly selected set of random questions.

# Storage Requirements

### Type A Activity Storage

This section defines the data storage needed to support **Type A activities**.

#### REQ-DL-1 — Question Bank Storage (Priority: High)

The application shall store a bank of pre-authored questions and answer options, independent of any specific student attempt.

**REQ-DL-1.1.** The application shall store questions in a table shared across all Type A activities. Each question record shall include:
- a unique question id
- the activity type the question belongs to (restricted to a known set of activity type values).
- the question prompt text presented to the student
- a difficulty level of the question, ranging from 1 (easiest) to 3 (hardest)
- the order number of the question (0 is the first question presented)
- the maximum possible score for the question (default is 25)

#### REQ-DL-2 — Answer Bank Storage (Priority: High)

**REQ-DL-2.1.** The application shall store answer options in a separate table, related to a question by its question id. Each option record shall include:
- a unique option id
- the question id it belongs to (foreign key)
- the option text presented to the student
- a score value, for the student choosing this option (25 at most = correct answer)
- an explanation describing why the option is correct or incorrect that can be presented when the option is chosen.
- a boolean value indicating if this is the correct answer to the question.

**REQ-DL-2.2.** The answer bank storage table shall support a variable number of options per question (not fixed to a specific count such as 4), so that different Type A activities can present different numbers of possible answers for the user to choose from.

---

#### REQ-DL-3 — Activity A Session Log  (Priority: High)

The application shall track a student's progress through an in-progress Type A activity, so the system knows which questions have been answered so far and whether the activity is complete. The application shall use the progress record to determine which questions in the activity have already been answered, so that a resumed activity does not repeat a question the student already completed. Note that a student could start an activity and return to the activity days later and continue it.

**REQ-DL-3.1.** When a student starts a Type A activity, the application shall create a session log record. This record is updated each time a question is answer, or if the user indicates that want to abandon the activity. 

The application shall use the session record to determine the last question presented, so that a resumed activity does not repeat a question the student already completed.

Each session record shall include:
- a unique activity session id
- the student account id (uuid)
- the activity type (restricted to a known set of activity type values).
- the degree of difficulty (1 to 3) of the questions
- the 4 questions in the activity, referenced by question id (foreign key)
- the date and time the activity was started
- a status. Restricted to a known set of activity type values: in-progress, completed, abandonded.
- the index (starts at 0) of the last question answered (must be <= 2)
- the date and time the activity was completed
- the cumulative score earned so far (sum of points accumulated as questions are answered, updated each time a question is answered)
- the maximum possible score for the activity (default = 100)
- passed field set to true if the activity as completed with a score higher than 75%.

---

#### REQ-DL-4 — Answered Question Log (Priority: Medium)

**REQ-DL-4.1.** The application shall store, for each question answered as part of a Type A activity, the following:

- the activity session log id (foreign key)
- the question id (foreign key)
- the option id of the answer (foreign key)
- the date and time the answer was submitted

---

#### REQ-PL-2 — Type A Activity Behavior 

**REQ-PL-2.1.** When a student starts or resumes a Type A activity, the application shall check for an existing "in progress" progress record for that student and activity type.  If the activity is in progress, the student has the choice of continuing or abandoning the activity. If continuing, the user and shall resume from the next unanswered question.  If an "in progress" activity is abandonded, this is recorded.

**REQ-PL-2.2.** The application shall present each question's prompt and its associated answer options to the student, as stored in the question bank.  The user can select one option.

**REQ-PL-2.3.** When the student selects an answer option, the application shall record this and updated the overall status of the activity (marking the last question answered).  

**REQ-PL-2.4.** If the student selects an incorrect option, the application shall:
- Display the explanation associated with the selected (incorrect) option.
- Display the correct answer.
- Display the explanation associated with the correct answer.

**REQ-PL-2.5.** If the student selects the correct option, the application shall display the explanation associated with the correct answer.

**REQ-PL-2.5.** The total cummulative score is adjusted in the session log after the student answers a question.

**REQ-PL-2.7.** After the student has answered a question and been shown the relevant explanation(s), the application shall either present the next unanswered question in the activity, or, if no questions remain, complete the activity.

**REQ-PL-2.8.** When the student has answered all questions in the activity, the application shall mark the progress record's status as "completed" and shall create a corresponding activity attempt record summarizing the overall result.

**REQ-PL-2.9.** If the student's score is 75% or higher, the student is informed that they passed.  Otherwise, the student is informed they must take the quiz again to advance.

**REQ-PL-2.10.** If the student passes the last difficulty level (3), the student is informed that they have successfully completed this skill.

---

# View Activity Requirements

### REQ-PL-3 - Viewing Student Activity
Students and instructors can view activity results.

#### REQ-PL-3.1 — Student Activity History

Students should be able to view a basic history of their own completed activities, including the activity type, submission date and score.

#### REQ-PL-3.2 — Instructor Activity Review

Instructors should be able to view student activity results so they can see which activities students completed and how students performed.

#### REQ-PL-3.3 — Instructor Activity Review

Instructor should be able to enter a class code to restrict the students that are displayed. 

#### REQ-PL-3.4 — Research Data Exports

This section of the requirements discuss what is need to make the application be useful for research.  In this scenario it must be able to separate different classes (e.g. different instructors or institutions) to see differences between class.

##### REQ-DL-3.4.1 — Table of Class Codes

There needs to be a table of class codes.  A code is a unique value that identifies a particular instance of a class of students.  We do not need to have a UI for maintaining the table and it could be seeded by hand or script.

##### REQ-DL-3.4.2 — Account Creation and Class Code

When a student creates an account, they must enter a correct class code.  The code should NOT be selectable by the student.  Instead, the instructor will give the students the code to use.  The code is associated with the account.

##### REQ-PL-3.4.3 — Exportable Depersonalized Report

The instructor should be able to enter a class code and receive a depersonalized csv file of data collected on the students.  Depersonalized means that the students' name are not in the csv file, but instead are referred to by a consisted ID instead. This ID could possible be the user record ID. The exported data should be all student activity data that could be useful for research.


##### REQ-PL-3.4.4 — Number of Students and User Interface

The user interface must be designed so that the user interface is usable assuming that there maybe at least 3 classes with 150 students per class.


---

# Indentifying Weak User Stories Requirements

### REQ-PL-4: Student Activity — Identify Weak User Stories
Identifying Weak User Stories is a Type A activity.  The user is presented a question asking the student to choose the weakest user story out in a given set of answers.  One answer is the "correct" answer scoring the maximum points.  The other answers can recieve partial points. The user is asked multiple questions before the activity is completed.  The questions and answers are stored in the database.  The questions are presented in increased difficulty. See **REQ-PL-2.9.** for general information on how the activity behaves.

---

# Indentifying Weak Acceptance Criteria Requirements

### REQ-PL-5: Student Activity - Identify Weak Acceptance Criteria
Identifying Weak Acceptance Criteria is a Type A activity.  The user is presented a question asking the student to choose the weakest acceptance story out in a given set of answers.

- The application should present the student with a user story and a list of possible acceptance criteria for that story.
- The student should be asked to identify which acceptance criteria is the weakest: unclear, incomplete, or not testable.
- The application should provide feedback explaining why the selected acceptance criteria is weak or which other acceptance criteria is even a weaker choice.
- The application should help the student understand that good acceptance criteria should be specific, testable, and clearly connected to the user story.
- The application should help the student distinguish between acceptance criteria that describe expected system behavior and statements that are vague, subjective, or too general.

---

# User Interface Requirements

### REQ-PL-6: User Interface

#### REQ-PL-6.1 - Navigation Bar
There should be a navigation bar containing an easy way to select activities and other commonly accessed functions.

#### REQ-PL-6.2 - Activity Selection
There should be a way to select an activity.

#### REQ-PL-6.3 - Activity Start/Resume/Abandon
After selecting an activity, the app should let the user know if the activity had previously been started.  If it had, the user should be able to abandon or resume the activity.  If there is not a previously started activity, then the user can start a new activity.

#### REQ-PL-6.4 - Type A Activity User Interface
As discussed in prior requirements, the user is presented with a question and possible answers.  The user can pick one answer (no multiple answer selections). The user must be able to click a submit button to confirm this is the answer that is being submitted. The user is presented with a comment on their selection.  If the selection is not correct, the user is show the correct answer with an explanation.  

---

# Gamification Elements

The Training Ground platform incorporates gamification elements to increase student engagement and provide a sense of progression and achievement. The goal is not to make the application feel like a game, but to give students clear feedback on their growth, motivate them to attempt harder challenges, and reward mastery with recognition that feels meaningful in an academic context.

## Cumulative Score
**REQ-GAM-DL-1**
a running total of points earned across all completed activity attempts, giving students a single number that reflects their overall practice effort. The cumulative score is calculated as the sum of the best passing score at each difficulty level for each activity type. This rewards improvement — a student who retakes a level and scores higher will see their cumulative score increase.

The application shall be able to calculate a cumulative score for each student representing the total points earned across all completed activity attempts.

The cumulative score shall be computed as follows:
    for each student
      for each type of activity
        for each difficult level
          find the highest score out of the completed sessions
          add this score to the accumated total

**REQ-GAM-PL-1**— Cumulative Score Display
A students cumulative score should be visible in the students profile or navbar.

---

## Mastery Titles
 Activity titles that are earned by passing successive difficulty levels. Each activity type has its own title track, so a student can hold different titles for different activities simultaneously, reflecting where they have genuinely invested effort. Titles are computed directly from session history and require no additional data entry — they are always an accurate reflection of the student's current standing.

### Storage
**REQ-GAM-DL-2** Title Definition Storage (Priority: Medium)
The application shall store a table of title definitions that maps an activity type and difficulty level to a title name.

**REQ-GAM-DL-2.1** Each title definition record shall include:

-a unique title definition id
-the activity type (foreign key, restricted to the known set of activity type values)
-the difficulty level that must be passed to earn this title (1, 2, or 3)
-the title name (e.g., "Story Apprentice", "Criteria Expert")

**REQ-GAM-DL-2.2** Title definitions shall be stored in the database rather than hardcoded in the application, so that new titles can be added when new activity types are introduced without requiring a code change.

### Business Logic
**REQ-GAM-BL-1** — Student Title Computation (Priority: Medium)
The application shall determine a student's current title for each activity type by querying their session history.

**REQ-GAM-BL-1.1** A student's current title for a given activity type shall be determined by finding the highest difficulty level for which the student has a completed session record with passed = true for that activity type. This value is then looked up in the title definition table (REQ-GAM-DL-2) to retrieve the corresponding title name.

**REQ-GAM-BL-1.2** A student's title for a given activity type shall always be computed at query time from existing session records — no separate title field needs to be stored on the student record.

### User Interface
**REQ-GAM-PL-2.1** If a student has no passed sessions for a given activity type, the application shall display "Not yet started" or equivalent for that activity's title.

**REQ-GAM-PL-2.2** Title Display (Priority: Medium)
The application shall display a student's current title for each activity type.

**REQ-GAM-PL-2.3** A student's titles shall be visible on their profile page, showing one title per activity type they have attempted.

**REQ-GAM-PL-2.4** When a student passes a difficulty level and earns a new title, the application shall display a notification informing the student of their new title. This notification shall appear on the activity completion screen immediately after the passed result is shown (REQ-PL-2.9).

**REQ-GAM-PL-2.5** The title notification shall include the title name and the activity type it belongs to — for example: "You've earned a new title: Story Analyst — Weak User Stories."

---

# Courses

Courses group students under a specific instructor, and course-scoped activities. A course is distinct from the "class code" model in REQ-PL-3.4.1/3.4.2 (a single code entered once at registration, for research grouping): a course is created by an instructor after registration, a student can enroll in more than one course, and activities, quizzes, and statistics can be scoped to one specific course.

### REQ-DL-5 — Course Enrollment Storage (Priority: Medium)

*(GitHub #245 — New Table for Course and Link to Student)*

As a student, I want to sign myself up for a course using a code my instructor gives me, so that my activity can be associated with that course/instructor. As an instructor, I want a table of the courses I create, so that I can scope questions, sessions, and reports to a specific course rather than my entire question bank.

**REQ-DL-5.1.** The application shall store courses independently of any specific student. Each course record shall include:
- a unique course id
- the instructor account id that owns the course (foreign key)
- a course name (display text)
- a unique, instructor-facing enrollment code the student enters to sign up (distinct from `class_code`)
- the date and time the course was created

**REQ-DL-5.2.** The application shall store, for each student enrolled in a course:
- a unique enrollment id
- the student account id (foreign key)
- the course id (foreign key)
- the date and time the student enrolled

A student may enroll in more than one course, and a course may have more than one student, but the same student may not enroll in the same course twice.

---

### REQ-PL-7 — Course Behavior (Priority: Medium)

**REQ-PL-7.1 — Instructor creates a course.** *(GitHub #239 — POST /api/courses)*
As an instructor, I want an endpoint to create a course, so that a unique course code is generated that I can share with students. The code is generated server-side (not client-supplied), and the response includes the created course's id, name, and code.

**REQ-PL-7.2 — Student joins a course by code.** *(GitHub #240 — POST /api/courses/join)*
As a student, I want to enter a code to link my account to a course, so that I'm associated with the right instructor. Joining a course the student already belongs to shall not error — it shall simply confirm the existing membership.

**REQ-PL-7.3 — Student leaves a course.** *(GitHub #324, #325 — Leave course action / self-service unenrollment endpoint)*
As a student, I want a self-service "Leave course" action, so that a course I joined by mistake, or no longer need, stops showing on my dashboard and leaderboard without depending on my instructor to remove me. The action requires a confirmation step, and the course disappears from the student's dashboard and leaderboard immediately after confirming.

**REQ-PL-7.4 — Instructor deletes a course.** *(GitHub #326 — Course deletion with enrollment-count confirmation)*
As an instructor, I want to delete a course I created, with a confirmation that states how many students will be unenrolled, so that I don't accidentally remove a course with active students. Deleting a course removes it from the instructor's list and from every previously-enrolled student's dashboard and leaderboard. A student's own score, titles, and activity history are not affected, since a session belongs to a student and an activity, not to a course.

**REQ-PL-7.5 — Instructor data is scoped to owned courses.** *(GitHub #381, #398 — Instructor sees only their own course's students and statistics)*
As an instructor, I want every student roster, activity report, and statistic I see to include only students enrolled in a course I created, so that I never see, or leak, another instructor's students, names, or scores. An instructor who owns no courses, or whose courses have no enrolled students, shall see an empty result rather than an error or another instructor's data. A student enrolled in courses owned by two different instructors shall appear correctly in both instructors' views, each scoped to that instructor's own course(s) only. Searching for a student to add to a course shall continue to search the full student roster, since a not-yet-enrolled student must still be discoverable.

**REQ-PL-7.6 — Per-course engagement overview.** *(GitHub #335, #394 — Per-Course Engagement Overview / Per-Course Roster & Quiz-Completion Stats)*
As an instructor, I want to see, per course, how many students are enrolled, how many have attempted or completed each activity, and the average score/pass rate, so that my dashboard reflects real engagement in my own courses rather than mixing every course together. A course with no activity yet shall show a clearly labeled "no data yet" state, distinguishable from an actual 0%.

---

# Question Catalogs and Custom Quizzes

Instructors are no longer limited to a fixed set of built-in activities. An instructor can create their own **question catalogs** (reusable, topic-based sets of questions) and **assembled quizzes** (one or more catalogs composed together and assigned to a course), instead of a single flat, shared question bank.

### REQ-DL-6 — Question Catalog and Quiz Storage (Priority: High)

*(GitHub #347 — Create and browse quizzes)*

As an instructor, I want to create a named quiz and see every quiz I own, so that I can build my own question sets instead of only using the built-in ones.

**REQ-DL-6.1.** An activity type record shall include a quiz name (required), a description (optional), and the id of the instructor who created it (nullable — built-in activity types have no owning instructor).

**REQ-DL-6.2.** The stored key for a new catalog shall be derived automatically from its name and must be unique; a name collision shall be reported to the instructor rather than silently modified.

### REQ-PL-8 — Question Catalog and Quiz Behavior (Priority: High)

**REQ-PL-8.1 — View and edit question catalogs.** *(GitHub #359 — View and Edit Question Catalogs)*
As an instructor, I want to view my question catalogs and edit the questions within them, so that I can organize questions into reusable, topic-based collections instead of managing them in a single flat question bank. An overview shall list all of the instructor's catalogs; opening one shows all of its questions; an edit mode allows adding, editing, and deleting questions within that specific catalog only — never affecting any other catalog.

**REQ-PL-8.2 — Create a quiz from one or more catalogs.** *(GitHub #360 — Create a Quiz)*
As an instructor, I want to create a quiz based on one or more question catalogs and assign it to a course, so that students can practice with questions automatically assembled from my catalogs. The existing three-level difficulty scheme is unchanged; for each difficulty level, questions are drawn at random from the chosen catalogs when a student starts a session.

**REQ-PL-8.3 — Manage a quiz's composition.** *(GitHub #361 — Manage a Quiz's Composition)*
As an instructor, I want to add or remove question catalogs from an existing quiz, exclude individual questions from it, and delete the quiz entirely, so that I can maintain a quiz without altering the underlying question catalogs. Excluding a question affects only that one quiz; the original catalog, and every other quiz that uses it, is unaffected.

**REQ-PL-8.4 — Hand-pick individual questions.** *(GitHub #380 — Hand-picking individual questions when building an assembled quiz)*
As an instructor, I want to add individual, hand-picked questions to a quiz, not only whole catalogs, so that I can build a quiz tailored to exactly what I want to test. A quiz's active question pool for a draw is: questions from its linked catalogs, minus this quiz's own exclusions, plus this quiz's hand-picked questions. Removing a hand-picked question from a quiz does not delete or alter the original question, and has no effect on any catalog or any other quiz. Hand-picked questions are shown clearly separated from catalog-sourced ones.

**REQ-PL-8.5 — Configurable questions per level.** *(GitHub #416 — Add section to decide how many questions per task)*
As an instructor, I want to choose how many questions are drawn per difficulty level for a quiz, so that I can control how long a session is, instead of always using the app-wide default.

**REQ-PL-8.6 — Choosing between a multiple-choice quiz and an LLM-graded task.** *(GitHub #379 — Choosing between an LLM task and a classic quiz when adding an activity)*
As an instructor, I want to choose whether a new catalog is a classic multiple-choice quiz or an LLM-graded free-text task when I create it, so that I am not limited to multiple-choice practice and can offer both types. The choice cannot be changed after the catalog is created. Selecting an LLM-graded task lets the instructor add free-text prompts the same way questions are added to a quiz catalog; students enrolled in a course that uses it can start, resume, and complete a session on it the same way they do for a multiple-choice quiz.

---

# Write Acceptance Criteria — Practice Sessions (extends REQ-FU-2)

The "Write Acceptance Criteria" activity described in REQ-FU-2 is implemented as a **four-story practice session**: a student is given four user stories, one at a time, writes acceptance criteria for each, and receives AI-generated feedback after each submission before an overall summary is shown at the end. This section supersedes the placeholder description in REQ-FU-2 with the requirements as actually built.

**REQ-FU-2.1 — Consistent story set per session (Priority: High).** *(GitHub #251 — Record which four user stories make up one practice session)*
As a developer, I want a practice session to remember exactly which four user stories were drawn for it and in what order, so that a student always sees the same, unchanging set of stories for that attempt, even after leaving and returning. No story shall be selected more than once within the same session.

**REQ-FU-2.2 — Link submissions to session and story (Priority: High).** *(GitHub #252 — Link each submitted set of acceptance criteria to its session and story)*
As a developer, I want every acceptance-criteria submission to record which session it belongs to and which of the four stories it answers, so that a student's progress through a session can always be reconstructed. The next story to work on shall always be the earliest story in the session with no submission yet. A story that already has a submission shall keep its original submission — it shall not be overwritten by a resubmission.

**REQ-FU-2.3 — Start or resume a session (Priority: High).** *(GitHub #254 — Start or resume a four-story acceptance-criteria session)*
As a student, I want to start a new practice session, or automatically continue one already running, so that I always pick up where I left off instead of accidentally starting over. If fewer eligible stories are available than a session needs, the student shall be clearly told the activity isn't available yet, rather than being given an incomplete session.

**REQ-FU-2.4 — Submit and receive feedback per story (Priority: High).** *(GitHub #256 — Submit acceptance criteria for the current story and reveal feedback afterward)*
As a student, I want to submit my acceptance criteria for my current story and then see the AI's rating and feedback for that specific story, so that I learn from each attempt before moving to the next one. A rating and feedback are generated and shown only after the submission has been recorded. A student may not submit criteria for a story they have not yet reached. A successful submission automatically advances the session to the next unanswered story.

**REQ-FU-2.5 — Automatic completion and overall result (Priority: High).** *(GitHub #257 — Automatically complete the session and summarize the overall result after the fourth story)*
As a student, I want my session to be automatically finished and given an overall result once I've submitted acceptance criteria for all four stories, so that I get a clear sense of how the whole round went, not just the last story. Once a session is complete, no further submission for it shall be accepted.

**REQ-FU-2.6 — Resume-or-start-over prompt (Priority: Medium).** *(GitHub #260 — Offer to resume or start over when returning to an in-progress session)*
As a student, I want to be asked whether to continue my current session or abandon it and start fresh, so that I stay in control of my in-progress attempt instead of losing it by accident.

**REQ-FU-2.7 — Session progress indicator (Priority: Medium).** *(GitHub #261 — Show progress while navigating through the four stories)*
As a student, I want to see how many of the four stories in my session I've completed and how many remain, so that I always know where I am in the activity.

**REQ-FU-2.8 — Clearly separated, copyable story content (Priority: Medium).** *(GitHub #262 — Present each user story with its title, description, and acceptance criteria clearly separated and copyable)*
As a student, I want to clearly see a story's title, description, and any example acceptance criteria as distinct, easy-to-copy sections, so that I can reference or reuse the story's content without confusion or manual reformatting.

**REQ-FU-2.9 — Overall session summary (Priority: Medium).** *(GitHub #263 — Show an overall summary once all four stories have been rated)*
As a student, I want to see a summary of my whole session after finishing the fourth story, so that I understand my overall performance across all four stories, not just the feedback for the last one.

### REQ-FU-2.10 — Instructor LLM Provider Configuration (Priority: High)

*(GitHub #135, #143, #144, #150 — instructor_llm_config table, save/fetch config routes, provider settings page)*

As an instructor, I want to choose an LLM provider (e.g. Claude, ChatGPT, Gemini) and paste my API key, so that my students' free-text submissions get graded by the model I trust, without a developer configuring it for me.

- The application shall store, per instructor, a chosen provider, an API key, an active model, and whether the configuration is active.
- The API key shall never be echoed back to the client once saved — the settings page always shows a masked field, never the previously saved raw key.
- Only one LLM configuration may be active across the application at a given time; activating a new one deactivates the previously active one.
- A submission is graded using the LLM provider configured by the instructor who authored the prompt being answered; a prompt authored by an instructor with no configured provider cannot be graded until one is set up.

---

# Leaderboard

### REQ-GAM-PL-3 — Leaderboard (Priority: Medium)

Students can see how their score compares to their classmates, both in a single course and across every course they share with other students.

**REQ-GAM-PL-3.1 — Leaderboard page.** *(GitHub #299 — Leaderboard page)*
As a student, I want a Leaderboard page showing my course's ranking, so that I can see where I stand against my classmates. The leaderboard shall show, per row: rank, avatar, username, points, and a rank-change indicator versus the previous time the student viewed it. The signed-in student's own row shall always be visible, even when it falls past the first page of results. A student can switch between the courses they belong to.

**REQ-GAM-PL-3.2 — Dashboard leaderboard widget.** *(GitHub #300 — Dashboard leaderboard widget)*
As a student, I want a glimpse of the ranking on my dashboard, so that I notice it without navigating to the full leaderboard page. The widget shall show the top five students, plus the signed-in student's own row appended if they are not already in the top five, and shall link to the full leaderboard page.

**REQ-GAM-PL-3.3 — Classmate public profile.** *(GitHub #301, #303 — Public student profile page / backed by real data)*
As a student, I want clicking a username on the leaderboard to open that person's profile, so that I can see who is ahead of me. The profile shall show the classmate's avatar, username, biography, cumulative score, and earned mastery titles. It shall not show the classmate's real name, age, semester, email, course list, individual answers, or attempt history. A student may only view the public profile of a classmate with whom they share at least one course.

**REQ-GAM-PL-3.4 — Ranking rules.** *(GitHub #302 — Leaderboard backed by real course data)*
The leaderboard roster for a course shall include every student enrolled in that course — including a student with zero completed sessions, shown with zero points — not only students who have attempted something. Ties shall receive standard competition ranking (e.g. 1, 2, 2, 4) with a deterministic tiebreaker, so two students with equal scores do not swap order between page views.

**REQ-GAM-PL-3.5 — Per-course and global point tracking.** *(GitHub #432 — Refactor point system: Track points per course and update leaderboards)*
As a student, I want the points I earn to be tracked per course, while still participating in a single, overall leaderboard on my dashboard, so that I can see both my standing within one class and my overall performance across every course I'm in. A course-scoped leaderboard shall rank students only by points earned within that specific course; the dashboard's leaderboard shall rank students by their total points across every course they share with the viewer.

---

# Daily Challenge

### REQ-GAM-PL-4 — Daily Challenge (Priority: Medium)

As a student, I want to see and attempt today's Daily Challenge question, worth double points, under a time limit, once per day, so that I have a reason to come back and practice every day.

**REQ-GAM-PL-4.1 — Entry point.** *(GitHub #336 — Add Daily Challenge entry point with timer and daily-availability state)*
A "Daily Challenge" entry point shall be shown to the student (e.g. on the dashboard), indicating whether today's attempt is still available or has already been used. Once attempted, the entry point shall indicate that the student must come back tomorrow. While attempting, a visible countdown shall be shown.

**REQ-GAM-PL-4.2 — Server-enforced rules.** *(GitHub #337 — Daily Challenge endpoint: random question, timed, double points, one attempt per day)*
The application shall serve one random question per day, drawn from the question bank. The time limit and the one-attempt-per-calendar-day rule shall be enforced server-side (a late or repeated submission is rejected), not only by the client-side countdown, so the challenge cannot be gamed by a slow network or repeated retries. A correct answer is awarded double the question's normal point value.

---

## Daily Streak

**REQ-GAM-BL-2 — Daily Streak Computation (Priority: Medium)**

*(GitHub #307 — REQ-GAM-BL-2: Daily Streak Computation)*

As a student, I want to build a daily streak by passing at least one activity on consecutive days, so that I have an extra incentive to practice regularly, with my streak visible (e.g. as a flame icon) on the leaderboard.

**REQ-GAM-BL-2.1.** The application shall calculate a current streak length for each student: the number of consecutive "streak days" on which at least one completed, passed activity exists.

**REQ-GAM-BL-2.2.** The streak shall be calculated at query time from existing session records, and shall not be stored as a dedicated field — the same "derived, not stored" approach as cumulative score (REQ-GAM-DL-1) and mastery titles (REQ-GAM-BL-1).

**REQ-GAM-BL-2.3 — Grace period.** A streak breaks if more than 36 hours (24h + a 12h grace period) elapse between two chronologically consecutive passed activities. A gap within 36 hours still counts the following calendar day as the next streak day, even if the time of day varies.

**REQ-GAM-BL-2.4.** Multiple passed activities completed on the same calendar day shall increase the streak by only one day, not once per activity.

**REQ-GAM-BL-2.5.** Streak days are computed strictly on server time (UTC), without adjusting for the student's local timezone.

---

## Instructor-Authored Mastery Titles

**REQ-GAM-DL-3 / REQ-GAM-BL-3 — Instructor-Defined Title Ladder (Priority: Medium)**

*(GitHub #454 — Instructor-defined mastery titles for a question catalog)*

As an instructor, I want to give a question catalog its own mastery titles when I create it — typing new ones or picking from titles that already exist — so that students who pass a level of my quiz earn a title that means something, instead of a bare "Level 1".

**REQ-GAM-DL-3.1.** When creating a question catalog, the instructor may optionally enter a title name for each difficulty level. A catalog created without titles behaves exactly as before — its levels show as "Level N" and remain unwearable.

**REQ-GAM-DL-3.2.** The instructor may reuse a title name that already exists elsewhere in the application (offered as suggestions), rather than typing a new one from scratch, to encourage consistent naming across catalogs.

**REQ-GAM-BL-3.1.** Titles may be edited on the catalog afterward. Renaming a title is reflected everywhere it is displayed, with no action required from a student who already holds it.

**REQ-GAM-BL-3.2.** No separate award step or notification write is required: because titles are computed at read time (REQ-GAM-BL-1), the moment a title is defined for a level a student has already passed, that student holds the title retroactively.

**REQ-GAM-BL-3.3.** Deleting a catalog shall delete its title ladder; any student currently displaying one of those titles shall silently stop displaying it, with no error and no orphaned data.

## Selecting a Displayed Title

**REQ-GAM-PL-5 — Student Selects Displayed Title (Priority: Low)**

*(GitHub #430 — actual quiz/title display on the student's profile page)*

As a student, I want to see my earned quiz titles clearly labeled by their real name (not a repeated "Level 1 / Level 2 / Level 3" placeholder) in a properly organized, responsive control on my profile page, and to choose which one is shown as my displayed title, so that I can identify and select the specific title I want to represent me without being confused by broken or repetitive formatting.

---

# Onboarding Tour

### REQ-PL-9 — First-Time Guided Tour (Priority: Low)

*(GitHub #318 — Add instructions tour for first time use)*

As a first-time user, I want a short guided tour when I log in for the first time, so that I understand where to find activities, my progress, and my profile without having to figure it out on my own.

**REQ-PL-9.1.** On a user's very first login only, a step-by-step guided tour shall automatically start, highlighting key areas of the app one at a time, each with a short, plain-language explanation.

**REQ-PL-9.2.** The user shall be able to move forward and backward through the tour's steps, and to skip or dismiss it at any point.

**REQ-PL-9.3.** Once the tour is completed or dismissed, it shall not appear again automatically on future logins. The user may optionally restart it later from a discoverable place, such as their profile page.

**REQ-PL-9.4.** The tour's steps shall adapt to the user's role — a student sees student-relevant steps (e.g. dashboard, activities, profile); an instructor sees instructor-relevant steps (e.g. instructor dashboard, question catalogs, courses).

---

# Lower Priority Student Activities

### REQ-FU-1: Student Activity: Write and Evaluate a User Story

- The application should allow a student to type in a user story.
- After the student submits the user story, the application should analyze the user story using the INVEST properties.
- The application should evaluate whether the user story appears to be:
  - Independent
  - Negotiable
  - Valuable
  - Estimable
  - Small
  - Testable
- The application should provide the student with feedback on which INVEST properties the user story satisfies and which may need improvement.
- The application should provide the student with suggestions on how the user story could be improved.
- The student is given a score.

### REQ-FU-2: Student Activity: Write Acceptance Criteria

- The application should present the student with a user story.
- The student should be asked to write acceptance criteria for that user story.
- The application should allow the student to submit the acceptance criteria.
- The application should evaluate whether the acceptance criteria are clear, testable, and connected to the user story.
- The application should provide feedback to help the student improve the acceptance criteria.

This activity is now implemented in full; see the **"Write Acceptance Criteria — Practice Sessions (extends REQ-FU-2)"** section above for the detailed, as-built requirements (REQ-FU-2.1–REQ-FU-2.10).

### Ideas for Other Activities

The following activities may be useful additions in a later version of the application, but they are not part of the initial requirements.

- The application could ask students to revise a weak user story and then compare the revised version with the original.
- The application could ask students to match user stories with appropriate acceptance criteria.
- The application could ask students to sort user stories from strongest to weakest.
- The application could ask students to identify which INVEST property is most clearly missing from a user story.
- The application could present a short project scenario and ask students to write several user stories for that scenario.
- The application could allow students to compare their answer with an example answer after completing an activity.

### Gamification Elements

The intention is to provide a learning platform which is different from traditional teaching approaches and provides fun or challenges for the user. Thus, the activity loop for the user should be advanced by…

1. Improve a user story.
2. Receive AI coaching and feedback.
3. Increase quality score and skill levels of the user.
4. Unlock more advanced challenges.

#### Gamification Elements which should be developed:

**Personal Bests**
- Track individual milestones such as highest quality improvement or longest learning streak.

**Story Quality Score**
- Show measurable improvement by comparing the original and revised story quality and visualize improvements.

**Professional Achievements**
- Earn role-like titles (e.g., "Story Refiner" or "Acceptance Criteria Expert") instead of playful badges.



#### Gamification Elements which could be developed:

**Requirements Escape Room Mode**
- Rescue a failing project by fixing critical requirements (in time).

**Hint System**
- Provide coaching hints with reduced rewards to encourage independent problem-solving.

**Boss Fights**
- Solve complex epics with multiple interconnected issues.

**Daily Challenges**
- Offer a short "Story of the Day" to promote continuous learning and engagement.
