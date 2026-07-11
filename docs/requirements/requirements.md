# Requirements Coach Platform

## User Requirements

### Purpose

The application will be a browser-based application that helps undergraduate computer science students practice writing and analyzing software requirements. The application will focus especially on user stories, so when this document refers to requirements, it generally means user stories written by or evaluated by students.

The goal of the application is not primarily to teach lessons on requirements, but to provide students with practice activities that help them improve their ability to recognize, write, evaluate, and revise user stories.

Gamification elements will be incorporated to increase activity engagement.

### Introduction to Activities and Opening Page

- An activity is a student exercise that presents a repeated task, for example, answering a multiple-choice question. The activity is scored out of 100 points.
- When the student selects an activity to do, the student sees an opening page that gives instructions on the activity.
- The opening page also shows the highest score the student has achieved in this activity, along with a list of prior results for the activity.
- The student can hit a button to start a new activity, or to continue an activity that was not completed.
- After completing the activity, the user is left at the opening page with updated results.

### Student Activity Tracking

- The application should allow each student to log in so that their progress can be associated with their individual account.
- The application should store student results for each activity.
- When an activity is started, it is given a unique ID.
- For each activity, the application should record:
  - The unique ID.
  - The type of activity.
  - The student who is associated with the activity.
  - The time at which the activity was started.
  - The score on the activity (updated when the subtask is completed).
  - Whether the activity was completed.
- Ideally, the application should allow student progress to be reviewed over time, so that it is possible to see whether a student is improving in writing and analyzing user stories.

## REQ-1: Student Activity — Identify Weak User Stories

**REQ-1.1.** The application shall present the student with a set of 4 user stories drawn from a bank of static questions stored in the database.

**REQ-1.2.** Each question in the database shall have an associated difficulty level, ranging from 1 (easiest) to 5 (hardest).

**REQ-1.3.** Each of the 4 user stories presented to the student shall be a selectable answer option.

**REQ-1.4.** Each answer option shall have an associated score value, ranging from 0 to 100, where the correct answer (the weakest user story) has a score of 100.

**REQ-1.5.** Each answer option shall have an associated explanation, stored in the database, describing why that user story is weak or, in the case of the correct answer, why it is the weakest of the 4 options.

**REQ-1.6.** When the student selects an answer option, the application shall record the score associated with that option as the score for the activity.

**REQ-1.7.** If the student selects an incorrect answer (an option with a score less than 100), the application shall:
- **REQ-1.7.1.** Display the explanation associated with the selected (incorrect) option.
- **REQ-1.7.2.** Display the correct answer.
- **REQ-1.7.3.** Display the explanation associated with the correct answer.

**REQ-1.8.** If the student selects the correct answer (the option with a score of 100), the application shall display the explanation associated with the correct answer.

**REQ-1.9.** Once the student has selected an answer and been shown the relevant explanation(s), the subtask shall be considered complete.

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
