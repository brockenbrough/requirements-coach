# Requirements Coach Platform

## Purpose

The application will be a browser-based application that helps undergraduate computer science students practice writing and analyzing software requirements. The application will focus especially on user stories, so when this document refers to requirements, it generally means user stories written by or evaluated by students.

The goal of the application is not primarily to teach lessons on requirements, but to provide students with practice activities that help them improve their ability to recognize, write, evaluate, and revise user stories.

Gamification elements will be incorporated to increase activity engagement.

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

A Type A activity presents the student with a prompt (e.g., a user story, or a scenario) along with a fixed set of pre-authored answer options. Each option has a known, stored score and a stored explanation. The student selects a single option, and the application uses the pre-authored data to score the attempt and display feedback — no AI evaluation is needed at attempt time.

Examples of Type A activities include "Identify Weak User Stories" and "Identify Weak Acceptance Criteria" (identifying the single weakest acceptance criterion from a list).

A Type A activity may contain one or more questions, presented to the student one at a time.  Each question answered correctly increases the total score for the activity.  Since a full score is 100 points for the entire activity, the points for a question must be carefully be pre-assigned so that the total for all correct answers is 100 points.  Only one option can be chosen by the user for each question.

# Storage Requirements

### Type A Activity Storage

This section defines the data storage needed to support **Type A activities**.

#### REQ-DL-1 — Question Bank Storage (Priority: High)

The application shall store a bank of pre-authored questions and answer options, independent of any specific student attempt.

**REQ-DL-1.1.** The application shall store questions in a table shared across all Type A activities. Each question record shall include:
- a unique question id
- the activity type the question belongs to (restricted to a known set of activity type values).
- the question prompt text presented to the student
- a difficulty level of the question, ranging from 1 (easiest) to 5 (hardest)
- the order number of the question (0 is the first question presented)
- the maximum possible score for the question

#### REQ-DL-2 — Answer Bank Storage (Priority: High)

**REQ-DL-2.1.** The application shall store answer options in a separate table, related to a question by its question id. Each option record shall include:
- a unique option id
- the question id it belongs to (foreign key)
- the option text presented to the student
- a score value, for the student choosing this option
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
- the date and time the activity was started
- a status. Restricted to a known set of activity type values: in-progress, completed, abandonded.
- the number of the last question answered
- the date and time the activity was completed

---

#### REQ-DL-4 — Answered Question Log (Priority: Medium)

**REQ-DL-3.1.** The application shall store, for each question answered as part of a Type A activity, the following:

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

**REQ-PL-2.6.** After the student has answered a question and been shown the relevant explanation(s), the application shall either present the next unanswered question in the activity, or, if no questions remain, complete the activity.

**REQ-PL-2.7.** When the student has answered all questions in the activity, the application shall mark the progress record's status as "completed" and shall create a corresponding activity attempt record summarizing the overall result.

### REQ-PL-3 - Viewing Student Activity
Students and instructors can view activity results.

#### REQ-PL-3.1 — Student Activity History

Students should be able to view a basic history of their own completed activities, including the activity type, submission date and score.

#### REQ-PL-3.2 — Instructor Activity Review

Instructors should be able to view student activity results so they can see which activities students completed and how students performed.

### REQ-PL-4: Student Activity — Identify Weak User Stories
Identifying Weak User Stories is a Type A activity.  The user is presented a question asking the student to choose the weakest user story out in a given set of answers.  One answer is the "correct" answer scoring the maximum points.  The other answers can recieve partial points. The user is asked multiple questions before the activity is completed.  The questions and answers are stored in the database.  The questions are presented in increased difficulty.

### REQ-PL-5: Identify Weak Acceptance Criteria
Identifying Weak Acceptance Criteria is a Type A activity.  The user is presented a question asking the student to choose the weakest acceptance story out in a given set of answers.

- The application should present the student with a user story and a list of possible acceptance criteria for that story.
- The student should be asked to identify which acceptance criteria is the weakest: unclear, incomplete, or not testable.
- The application should provide feedback explaining why the selected acceptance criteria is weak or which other acceptance criteria is even a weaker choice.
- The application should help the student understand that good acceptance criteria should be specific, testable, and clearly connected to the user story.
- The application should help the student distinguish between acceptance criteria that describe expected system behavior and statements that are vague, subjective, or too general.

## Other Planned Activities (Lowest Priority)

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

### Future Enhancements

The following activities may be useful additions in a later version of the application, but they are not part of the initial requirements.

- The application could ask students to revise a weak user story and then compare the revised version with the original.
- The application could ask students to match user stories with appropriate acceptance criteria.
- The application could ask students to sort user stories from strongest to weakest.
- The application could ask students to identify which INVEST property is most clearly missing from a user story.
- The application could present a short project scenario and ask students to write several user stories for that scenario.
- The application could allow students to compare their answer with an example answer after completing an activity.

#### Gamification Elements which could be developed:

**Requirements Escape Room Mode**
- Rescue a failing project by fixing critical requirements (in time).

**Hint System**
- Provide coaching hints with reduced rewards to encourage independent problem-solving.

**Boss Fights**
- Solve complex epics with multiple interconnected issues.

**Daily Challenges**
- Offer a short "Story of the Day" to promote continuous learning and engagement.
