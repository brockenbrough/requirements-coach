# Requirements Coach Platform

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

The questions are stored in a question bank.  Each question has a difficulty rating (1=easy, 2=medium, 3=hard). Students start at the easy level.  The student is given 4 random questions from the bank at that level.  Each question is worth 25 points at most.  If the student has a cummulative score of 80% on the questions, then the student can advance to the next level of difficult.  Otherwise, the student must repeat the level before advancing by trying a new version of the quiz with a newly selected set of random questions.

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
- passed field set to true if the activity as completed with a score higher than 80%.

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

**REQ-PL-2.9.** If the student's score is 80% or higher, the student is informed that they passed.  Otherwise, the student is informed they must take the quiz again to advance.

**REQ-PL-2.10.** If the student passes the last difficulty level (3), the student is informed that they have successfully completed this skill.

---

# View Activity Requirements

### REQ-PL-3 - Viewing Student Activity
Students and instructors can view activity results.

#### REQ-PL-3.1 — Student Activity History

Students should be able to view a basic history of their own completed activities, including the activity type, submission date and score.

#### REQ-PL-3.2 — Instructor Activity Review

Instructors should be able to view student activity results so they can see which activities students completed and how students performed.

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

The Requirements Coach platform incorporates gamification elements to increase student engagement and provide a sense of progression and achievement. The goal is not to make the application feel like a game, but to give students clear feedback on their growth, motivate them to attempt harder challenges, and reward mastery with recognition that feels meaningful in an academic context.

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
