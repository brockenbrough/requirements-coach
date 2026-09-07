# Training Ground Platform — User Requirements Document (URD)

## 1. Introduction

### 1.1 Purpose

This document describes the Training Ground platform from the point of view of the people who
use it: what they need to accomplish, and why. It intentionally leaves out data storage design,
table structures, API routes, and other implementation detail, focusing only on user-facing needs
and goals.

### 1.2 Scope

Training Ground is a browser-based application that helps undergraduate computer science
students practice recognizing, writing, evaluating, and revising software requirements —
particularly user stories and acceptance criteria. It is a practice tool, not a lecture
platform: the product's value is repeated, scored practice with immediate feedback, wrapped in
enough gamification (scores, titles, streaks, a leaderboard) to keep students coming back.

Instructors use the same platform to organize students into courses, author their own practice
content, and monitor how their students are doing — including, for research purposes, exporting
depersonalized activity data at class scale.

### 1.3 Intended Audience

This document is for anyone who needs to understand *what the product must do for its users*
without wading through schema design: instructors, course stakeholders, new team members
getting oriented, and anyone validating that a build actually serves the people it's for.

### 1.4 User Classes

| User class | Description |
|---|---|
| **Student** | An undergraduate enrolled in one or more courses, practicing requirements-writing skills through scored activities. |
| **Instructor** | Creates and owns courses, authors practice content (question catalogs, quizzes, free-text prompts), and reviews student performance. |
| **Researcher** (via the instructor role) | Uses depersonalized, class-scale exports to study learning outcomes across classes or institutions. |
| **First-time user** | Either role, on their very first login, before they've learned the app's layout. |

### 1.5 Operating Environment

A standard web browser, no installed client. The interface must remain usable at the scale of a
real course roster — at least 3 classes of 150 students each — not just a handful of
demo accounts.

---

## 2. General User Needs

**UR-1 — Practice through activities.** As a student, I want a library of discrete practice
activities I can start, pause, and resume, so that I can fit practice into short sessions rather
than needing to finish everything in one sitting.

**UR-2 — Know what I'm about to do.** As a student, before starting an activity I want clear
instructions, my best-ever score on it, and a list of my past attempts, so that I can decide
whether to try again or move to something new.

**UR-3 — Pick up where I left off.** As a student, if I leave an activity partway through — even
for several days — I want to resume from exactly where I stopped rather than repeat questions
I've already answered, or explicitly abandon it and start clean.

---

## 3. Multiple-Choice Practice Activities

These needs cover the "Type A" activities: **Identify Weak User Stories** and **Identify Weak
Acceptance Criteria**.

**UR-4 — Practice at my own level.** As a student, I want to be given questions at a difficulty
that matches my current skill, and to only advance to harder questions once I've shown I'm ready,
so that practice stays challenging without being discouraging.

**UR-5 — One clear choice, honest feedback.** As a student, I want to be shown a scenario and a
set of possible answers, pick exactly one, and immediately learn whether I was right — with an
explanation either way — so that I understand *why*, not just whether I scored.

**UR-6 — Know if I passed.** As a student, after finishing a round of questions I want to be told
plainly whether I passed and can move up a level, or need to try again, so that my next action is
obvious.

**UR-7 — Recognize mastery.** As a student, when I pass the hardest level of an activity, I want
to be told I've mastered that skill, so that my progress feels like an accomplishment rather than
just "no more questions."

**UR-8 — Judge which user story is weakest.** As a student, I want an activity that shows me a set
of user stories and asks me to pick the weakest one, with feedback on why, so that I build an eye
for what makes a user story strong or weak.

**UR-9 — Judge which acceptance criteria is weakest.** As a student, I want an activity that shows
me a user story with several candidate acceptance criteria and asks me to identify the weakest
one — unclear, incomplete, or untestable — with feedback that helps me tell strong, testable
criteria from vague ones, so that I improve at writing my own.

---

## 4. Free-Text, AI-Graded Practice

**UR-10 — Write real acceptance criteria and get real feedback.** As a student, I want to be
given a user story, write my own acceptance criteria in my own words, and receive AI-generated
feedback and a score on my specific answer, so that I practice the actual skill of writing
criteria rather than only recognizing good and bad examples.

**UR-11 — Work through a consistent set, one at a time.** As a student, I want a practice session
built from four stories that stay the same throughout my attempt, presented one at a time with
feedback after each, so that I always know how much is left and never lose my place if I step
away.

**UR-12 — See a clear, copyable version of the story.** As a student, I want each story's title,
description, and any example criteria shown as distinct sections I can easily read and copy, so
that referencing the story while I write isn't awkward.

**UR-13 — Get an overall result, not just the last answer.** As a student, once I've submitted
criteria for all four stories, I want a summary of how I did across the whole session, so that I
understand my overall performance, not only my most recent answer.

**UR-14 — Choose to resume or restart.** As a student returning to an unfinished session, I want
to be asked whether to continue where I left off or abandon it and start over, so that I stay in
control of my attempt.

**UR-15 — Trust that grading is set up.** As an instructor, I want to configure which AI provider
grades my students' free-text answers and supply my own credentials, so that grading reflects a
model I trust and my key is never exposed back to me or anyone else once saved.

---

## 5. Reviewing Progress and Activity History

**UR-16 — See my own history.** As a student, I want to view a simple history of the activities
I've completed, including what I did, when, and what I scored, so that I can track my own
improvement over time.

**UR-17 — See how my students are doing.** As an instructor, I want to view which activities my
students have completed and how they performed, so that I can identify who needs help and which
activities are working.

**UR-18 — Narrow my view to one class.** As an instructor, I want to filter what I see down to a
specific class, so that I'm not sifting through every student I've ever taught to find the ones I
currently care about.

**UR-19 — Export research-ready data without exposing identities.** As an instructor doing
research, I want to export a class's activity data as a spreadsheet-friendly file that never
includes student names — only a consistent, anonymous identifier — so that I can study learning
outcomes without compromising student privacy, and so that data from different classes or
institutions can be compared.

**UR-20 — Trust the app at real class scale.** As an instructor, I want the interface to stay
usable and responsive even when a class has 150 students, and even across several classes at
once, so that the tool works for a real course, not just a demo roster.

---

## 6. Courses

**UR-21 — Create a course and get a code to share.** As an instructor, I want to create a course
and receive a unique code generated for me, so that I have something simple to hand my students
for enrollment.

**UR-22 — Join my class with a code.** As a student, I want to enter the code my instructor gave
me to join their course, so that my activity is correctly associated with the right class — and
if I enter a code for a course I've already joined, I want nothing to break.

**UR-23 — Leave a course I joined by mistake.** As a student, I want a simple, confirmed way to
leave a course, so that it stops appearing on my dashboard and leaderboard without needing my
instructor to remove me.

**UR-24 — Delete a course responsibly.** As an instructor, I want to delete a course I created and
be told up front how many students that will unenroll, so that I don't accidentally wipe out a
class with active students. I also want reassurance that a student's own scores and history
aren't lost just because a course is deleted.

**UR-25 — See only what's mine.** As an instructor, I want every roster, report, and statistic I
view to reflect only students in courses I actually created — never another instructor's
students or data — while still being able to find and add a not-yet-enrolled student to my own
course.

**UR-26 — Understand engagement per course.** As an instructor, I want to see, per course, how
many students are enrolled and how they're engaging with each activity — including a clear
"no data yet" state for a course that hasn't started, rather than a misleading zero.

---

## 7. Authoring Custom Content

**UR-27 — Build my own question sets.** As an instructor, I want to create and name my own
reusable collections of questions ("catalogs") instead of relying only on a single shared
question bank, so that I can organize practice content by topic and reuse it across courses.

**UR-28 — Assemble a quiz for my course.** As an instructor, I want to combine one or more of my
catalogs into a quiz and assign it to a specific course, so that students get a quiz built from
exactly the content I intend, drawn at random within each difficulty level.

**UR-29 — Fine-tune a quiz without touching the source material.** As an instructor, I want to
add or remove catalogs from a quiz, exclude specific questions from just that quiz, and delete
the quiz entirely — all without altering the original catalog or any other quiz built from it.

**UR-30 — Hand-pick individual questions.** As an instructor, I want to add specific questions to
a quiz one at a time, not just whole catalogs, and see clearly which questions were hand-picked
versus drawn from a catalog, so that I can build a quiz tailored exactly to what I want to test.

**UR-31 — Control session length.** As an instructor, I want to choose how many questions are
drawn per difficulty level for my quiz, so that I can control roughly how long a session takes,
rather than always using the same fixed number.

**UR-32 — Choose the kind of activity I'm creating.** As an instructor, when creating a new
catalog I want to choose whether it's a classic multiple-choice quiz or a free-text task graded
by AI, so that I'm not limited to one format — and I want that choice to be final, so students
never encounter a catalog changing shape underneath them.

---

## 8. Motivation and Progress Recognition (Gamification)

**UR-33 — See my overall progress as one number.** As a student, I want a single cumulative score
that reflects my best result at every difficulty level across every activity I've tried, visible
on my profile or navigation bar, so that retaking and improving on something always helps my
total and I have one number that represents my overall effort.

**UR-34 — Earn recognizable titles.** As a student, I want to earn a title for each activity as I
pass its difficulty levels, shown on my profile, so that my progress in each specific skill is
recognized by name, not just by a score. If I haven't attempted an activity yet, I want that to
read as "not yet started" rather than something confusing.

**UR-35 — Be told the moment I earn something new.** As a student, right after I pass a level and
earn a new title, I want to be notified immediately — naming the title and the activity it's
for — so that the achievement feels tied to the moment I earned it.

**UR-36 — See how I stack up against classmates.** As a student, I want a leaderboard showing my
rank, points, and how my rank has changed since I last checked, for both a single course and
across every course I share with others, so that I have a social reason to keep practicing.

**UR-37 — Check out a classmate, safely.** As a student, I want to click a name on the leaderboard
and see that person's public profile — avatar, username, bio, score, and titles — without ever
seeing their real name, email, or individual answers, and only for someone I actually share a
course with.

**UR-38 — Trust the leaderboard is fair.** As a student, I want every enrolled classmate to appear
on the leaderboard (even with zero points if they haven't started), and I want ties broken
consistently so rankings don't shuffle randomly between visits.

**UR-39 — A reason to come back every day.** As a student, I want a Daily Challenge — one
question, worth double points, under a visible time limit, available once per day — so that I
have a standing reason to open the app daily, and I want that limit genuinely enforced so it
can't be gamed by retrying or a slow connection.

**UR-40 — Build a streak.** As a student, I want to build a visible daily streak by passing at
least one activity each day, with a fair grace period so a slightly late night doesn't
unfairly break it, so that I'm nudged toward regular practice rather than cramming.

**UR-41 — Give my content its own titles.** As an instructor, I want to optionally define custom
title names for the difficulty levels of a catalog I create — typing new ones or reusing existing
ones — so that students earn titles that mean something specific to my content, and I want to be
able to rename them later with every affected student updated automatically.

**UR-42 — Choose which title represents me.** As a student, I want to see all my earned titles
clearly labeled by their real names and pick which one is displayed as my public title, so that
I can represent myself the way I want, without confusing placeholder labels.

---

## 9. Getting Started

**UR-43 — Learn the app without a manual.** As a first-time user, I want a short guided tour on my
very first login that highlights the key parts of the app relevant to my role, with plain-language
explanations, so that I know where to find activities, my progress, and my profile without
guessing.

**UR-44 — Stay in control of the tour.** As a first-time user, I want to move back and forth
through the tour or skip it entirely, and never have it force itself on me again once I've
finished or dismissed it — though I'd like the option to replay it later from my profile if I
want a refresher.

---

## 10. Lower-Priority and Future Needs

These reflect needs flagged as lower priority or aspirational — useful for roadmap context, not
committed scope.

**UR-45 — Get feedback on a user story I write from scratch.** As a student, I want to type my
own user story and receive feedback structured around the INVEST properties (Independent,
Negotiable, Valuable, Estimable, Small, Testable), with a score and suggestions for improvement,
so that I practice authoring, not just evaluating.

**UR-46 — Ideas not yet committed to a version.** As a student, I would value being able to: revise a
weak story and compare it to the original; match stories to appropriate acceptance criteria; rank
a set of stories from strongest to weakest; identify which INVEST property a story is missing; write
several stories for a short scenario; and compare my answer to a model answer after finishing an
activity.

**UR-47 — Deeper motivational features under consideration.** As a student, I would value
personal-best tracking, a visualized story-quality score comparing my original and revised
attempts, and professional-sounding achievement titles — and, more speculatively, timed
"escape room" style challenges, an optional hint system with a reward trade-off, multi-part "boss"
challenges, and a distinct "story of the day" feature.

---

## 11. Constraints and Assumptions

- The product is browser-based; no native client is in scope.
- Practice content quality (question authoring, prompt wording) is the instructor's
  responsibility — the platform provides the authoring tools but does not generate content on its
  own for multiple-choice activities.
- AI-graded feedback depends on an instructor having configured a working LLM provider; a
  free-text activity is only usable once that setup is complete.
- Research exports assume instructors are willing to work with anonymized identifiers rather than
  student names.
- The interface must remain usable at a minimum of 3 classes × 150 students; user needs are not
  considered met if they only work at demo scale.
