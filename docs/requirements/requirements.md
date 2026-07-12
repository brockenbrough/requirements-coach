# Requirements Coach Platform

## Purpose

The application will be a browser-based application that helps undergraduate computer science students practice writing and analyzing software requirements. The application will focus especially on user stories, so when this document refers to requirements, it generally means user stories written by or evaluated by students.

The goal of the application is not primarily to teach lessons on requirements, but to provide students with practice activities that help them improve their ability to recognize, write, evaluate, and revise user stories.

Gamification elements will be incorporated to increase activity engagement.

## Introduction

### Activities and Opening Page

- An activity is a student exercise that presents a repeated task, for example, answering a multiple-choice question. The activity is scored out of 100 points.
- When the student selects an activity to do, the student sees an opening page that gives instructions on the activity.
- The opening page also shows the highest score the student has achieved in this activity, along with a list of prior results for the activity.
- The student can hit a button to start a new activity, or to continue an activity that was not completed.
- After completing the activity, the user is left at the opening page with updated results.

### Different Types of Activities
As the features of this application expand, there will be multiple types of activities that the students can do.  The initial implementation will focuse of "Type A" activities which present a bank of questions to the user with one correct answer. 

## Requirements

### Type A Activity Storage

This section defines the data storage needed to support **Type A activities**. Type A activities are those built around a pre-authored bank of questions and answer options, as opposed to Type B activities, which are free-response and evaluated dynamically by AI.

#### What Is a Type A Activity?

A Type A activity presents the student with a prompt (e.g., a user story, or a scenario) along with a fixed set of pre-authored answer options. Each option has a known, stored score and a stored explanation. The student selects a single option, and the application uses the pre-authored data to score the attempt and display feedback — no AI evaluation is needed at attempt time.

Examples of Type A activities include "Identify Weak User Stories" and "Identify Weak Acceptance Criteria" (identifying the single weakest acceptance criterion from a list).

A Type A activity may contain one or more questions, presented to the student one at a time.

#### REQ-DL-1 — Question Bank Storage

The application shall store a bank of pre-authored questions and answer options, independent of any specific student attempt.

**REQ-DL-1.1.** The application shall store questions in a table shared across all Type A activities. Each question record shall include:
- a unique question id
- the activity type the question belongs to (restricted to a known set of activity type values)
- the prompt text presented to the student (e.g., the user story or scenario)
- a difficulty level, ranging from 1 (easiest) to 5 (hardest)

**REQ-DL-1.2.** The application shall store answer options in a separate table, related to a question by its question id. Each option record shall include:
- a unique option id
- the question id it belongs to (foreign key)
- the option text presented to the student
- a score value, ranging from 0 to 100 if this answer is chosen by the student (for example, 100 is correct answer, 50 is partial credit)
- an explanation describing why the option is correct or incorrect

**REQ-DL-1.3.** The options table shall support a variable number of options per question (not fixed to a specific count such as 4), so that different Type A activities can present different numbers of choices.

**REQ-DL-1.4.** Exactly one option per question shall have a score of 100 (the correct answer). All other options shall have a score less than 100.

---

#### REQ-DL-2 — Activity Progress Storage

The application shall track a student's progress through an in-progress Type A activity, so the system knows which questions have been answered so far and whether the activity is complete. This record is distinct from the completed-attempt history described in REQ-1 (Student Activity Tracking); it exists only while an activity is actively being worked on.

**REQ-DL-2.1.** When a student starts a Type A activity, the application shall create a progress record. Each progress record shall include:
- a unique progress id
- the student account id (uuid)
- the activity type
- the date and time the activity was started
- a status (e.g., "in progress" or "completed")

**REQ-DL-2.2.** The application shall store, for each question presented to the student within the activity, which question was shown, the single option the student selected, and the score awarded for that question.

**REQ-DL-2.3.** The application shall use the progress record to determine which questions in the activity have already been answered, so that a resumed activity does not repeat a question the student already completed.

**REQ-DL-2.4.** When the student has answered all questions in the activity, the application shall mark the progress record's status as "completed" and shall create a corresponding activity attempt record (per REQ-1) summarizing the overall result.

---

#### REQ-DL-3 — Type A Activity Behavior

**REQ-DL-3.1.** When a student starts or resumes a Type A activity, the application shall check for an existing "in progress" progress record for that student and activity type, and shall resume from the next unanswered question if one exists.

**REQ-DL-3.2.** The application shall present each question's prompt and its associated answer options to the student, as stored in the question bank.

**REQ-DL-3.3.** When the student selects an answer option, the application shall record the selection and score in the progress record, per REQ-DL-2.2.

**REQ-DL-3.4.** If the student selects an incorrect option (a score less than 100), the application shall:
- Display the explanation associated with the selected (incorrect) option.
- Display the correct answer.
- Display the explanation associated with the correct answer.

**REQ-DL-3.5.** If the student selects the correct option (a score of 100), the application shall display the explanation associated with the correct answer.

**REQ-DL-3.6.** After the student has answered a question and been shown the relevant explanation(s), the application shall either present the next unanswered question in the activity, or, if no questions remain, complete the activity per REQ-DL-2.4.

### REQ 1 — Student Activity Tracking

The application should track each student’s work on practice activities so that students and instructors can review progress over time.

The system should record one **activity attempt** each time a student submits an answer to a question. For each submitted attempt, the system should store:

- the student account id (uuid)
- the activity type. Create the field to store text, but restrict the values to a known set of activity names.
- the date and time submitted
- the student’s answer or response.  Store as text. For multiple choice questions, the text should be "A", "B", "C", etc.
- the score result. Store as number.

### REQ 2 - Viewing Student Activity
Students and instructors can view activity results.

#### REQ 2.1 — Student Activity History

Students should be able to view a basic history of their own completed activities, including the activity type, submission date and score.

#### REQ 2.2 — Instructor Activity Review

Instructors should be able to view student activity results so they can see which activities students completed and how students performed.

### REQ-3: Student Activity — Identify Weak User Stories
This requirements describes the behavior of the student activity presenting only 1 question for the student to answer. REQ-4 expands this behavior by specifying that there are multiple questions in the activity.

**REQ-3.1.** The application shall present the student with a set of 4 user stories drawn from a bank of static questions stored in the database.

**REQ-3.2.** Each question in the database shall have an associated difficulty level, ranging from 1 (easiest) to 5 (hardest).

**REQ-3.3.** Each of the 4 user stories presented to the student shall be a selectable answer option.

**REQ-3.4.** Each answer option shall have an associated score value, ranging from 0 to 100, where the correct answer (the weakest user story) has a score of 100.

**REQ-3.5.** Each answer option shall have an associated explanation, stored in the database, describing why that user story is weak or, in the case of the correct answer, why it is the weakest of the 4 options.

**REQ-3.6.** When the student selects an answer option, the application shall record the score associated with that option as the score for the activity.

**REQ-3.7.** If the student selects an incorrect answer (an option with a score less than 100), the application shall:
- Display the explanation associated with the selected (incorrect) option.
- Display the correct answer.
- Display the explanation associated with the correct answer.

**REQ-3.8.** If the student selects the correct answer (the option with a score of 100), the application shall display the explanation associated with the correct answer.

**REQ-3.9.** Once the student has selected an answer and been shown the relevant explanation(s), the activity shall be considered complete.

## Other Planned Activities

### Student Activity: Identify Weak Acceptance Criteria

- The application should present the student with a user story and a list of possible acceptance criteria for that story.
- The student should be asked to identify which acceptance criteria are weak, unclear, incomplete, or not testable.
- The application should allow the student to select one or more acceptance criteria that need improvement.
- The application should provide feedback explaining why the selected acceptance criteria are weak or why other acceptance criteria may have been stronger choices.
- The application should help the student understand that good acceptance criteria should be specific, testable, and clearly connected to the user story.
- The application should help the student distinguish between acceptance criteria that describe expected system behavior and statements that are vague, subjective, or too general.

### Student Activity: Write and Evaluate a User Story

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
- This activity consists <!-- NOTE: sentence appears cut off in the source document -->

### Student Activity: Write Acceptance Criteria

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
