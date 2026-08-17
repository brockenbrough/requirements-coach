# Handoff — GitHub #379, Commits 9–12

**Issue:** *As an instructor, I want to choose whether a new activity I add to my course is a classic multiple-choice quiz or an LLM-graded free-text task.*

Full design rationale lives in the plan at
`~/.claude/plans/ich-m-chte-folgende-user-abstract-codd.md`. This file is the delta: what is already
done, what is left, and the decisions a new agent must not re-litigate.

---

## Where things stand

Branch `louis`, 8 of 12 commits landed, each individually green on `npm test` **and** `npm run build`:

| # | Commit | What it did |
|---|---|---|
| 1 | `bc86c80` | `fk_user_story_activity_type` + footer migration note; seed 15 → 24 prompts (8 per level) |
| 2 | `84277b3` | `GradingKind` / `isGradingKind` / `getGradingKind` in `lib/activityTypes.ts` + first test file for it |
| 3 | `09cfb23` | `grading_kind` plumbed through every read: `activityTypeQueries`, `activityCourseQueries`, `GET /api/activities/{activityType}`, `QuizSummary`, `CourseActivity`, `ActivityDefinition` |
| 4 | `145cbd6` | **AC #1 done** — `POST /api/activities/types` requires `gradingKind`; `CreateCatalogModal` radio cards; Type column on the catalog list |
| 5 | `80e064b` | Prompt CRUD: `POST`/`PATCH`/`DELETE /api/instructor/user-stories[/{id}]`, `lib/userStoryInput.ts`, `listCatalogUserStories` |
| 6 | `d63b7a8` | **AC #3 done** — catalog detail page branches on kind; `PromptFormModal`, `CatalogPromptCard`, `ConfirmModal` delete, per-level coverage banner |
| 7 | `ac614ea` | `buildRatingPrompt` builds a real prompt (task + fenced answer + `RATING_RUBRIC`, 1–10 bands) |
| 8 | `b105636` | Mechanical rename `lib/acceptanceCriteria*` → `lib/llmActivity*` (+ `AC_PASS_SCORE` → `PROMPT_PASS_SCORE`, `AcceptanceCriteriaResult` → `LlmGradingResult`, …) |

**Uncommitted work in the tree** (this is Commit 9, ~90 % done):

```
 M app/api/activities/write-acceptance-criteria/sessions/route.ts          # findInProgressAcSession inlined
 M app/api/activities/write-acceptance-criteria/sessions/current/route.ts  # same
 M lib/llmActivityQueries.ts                                               # -findInProgressAcSession, +loadUserStoryPool
?? app/api/activities/[activityType]/llm/{sessions,sessions/current,submissions}/route.ts
?? __tests__/api/llm-sessions.test.ts            # 17 tests, green
?? __tests__/api/llm-sessions-current.test.ts    # green
?? __tests__/api/llm-submissions.test.ts         # 17/20 green, 3 trivial failures — see below
```

`npm run build` is clean; Next.js registers the new `[activityType]/llm/*` routes alongside the
static `write-acceptance-criteria/*` ones, confirming the routing assumption.

---

## Decisions already made — do not revisit

1. **Generalize, don't parallelize.** `WRITE_ACCEPTANCE_CRITERIA` ends up as an ordinary row with
   `grading_kind = 'llm-graded'`. There must be exactly one LLM implementation when this is done.
2. **Difficulty levels 1–3 apply to LLM-graded activities.** The draw filters `user_story` by
   `difficulty_level`, and the session starts at `findStartDifficultyLevel`'s answer, not always 1.
   This *is* a behavior change for existing WAC data (every historical session is level 1, so a
   student who passed one now auto-advances to level 2) — accepted, must go in the PR body.
3. **`gradingKind` is required, never optional.** On `ActivityDefinition`, on `createQuiz`'s input,
   and in the `POST /api/activities/types` body. Do not weaken any of these to make a build pass.
4. **Keep the `write-acceptance-criteria` entry in `ACTIVITIES`** (`lib/activityContent.ts`) when
   deleting the static pages. `useResolvedActivity` checks `ACTIVITIES` first, so that entry is what
   keeps the `/activities/write-acceptance-criteria` URL alive and preserves its rich metadata.
5. **Seeded prompts stay ungradable.** `user_story.creator_id IS NULL` → the submissions route 500s
   with *"The instructor who created this prompt has not configured an LLM provider."* AC #6 is met
   via instructor-authored prompts, which always carry a `creator_id`. Any QA script must create a
   prompt through the new UI; testing against the seeded set looks like a failure that isn't one.
6. **`lib/acceptanceCriteriaSubmissionsStore.ts` and the `/api/instructor/acceptance-criteria/*`
   route paths keep their old names.** Renaming a live route path is a separate, riskier change.

---

## Story 9 — Finish the generic LLM session routes

> **As a student enrolled in a course, I want to start, resume and submit against any LLM-graded
> activity, so that an instructor's own free-text task works the same way the built-in one does.**

Almost entirely done in the working tree. What remains:

**Acceptance criteria**
- [ ] `__tests__/api/llm-submissions.test.ts` is green.
- [ ] `npm test` and `npm run build` both clean.
- [ ] The three `write-acceptance-criteria/*` routes still exist and still work — they are deleted
      in Story 10, not here, so nothing is broken mid-stream.

**The three failures, and their cause.** That file was derived from
`__tests__/api/write-acceptance-criteria-submissions.test.ts` with a regex that rewrote
`POST(req(…))` into `POST(req(…), PARAMS())`. The regex used a non-greedy `[^)]*`, so it skipped
every call whose `req(...)` argument itself contains parentheses. Three call sites therefore still
invoke `POST(req(...))` with no second argument and fail with:

```
TypeError: Cannot destructure property 'params' of 'undefined' as it is undefined.
```

The failing tests are *"returns 401 for an invalid token"*, *"returns 400 when submittedText exceeds
the length cap"*, and *"returns 400 when the story does not belong to this session"*. Fix: add
`, PARAMS()` to those three calls. Check the whole file with
`grep -n 'POST(req' __tests__/api/llm-submissions.test.ts` — every call needs the params argument.

**Worth adding while there** (not blocking): a `400` case for an `mcq` `activityType` and one for an
unknown key, plus an assertion that the `session_log` lookup filters on `params.activityType` rather
than a literal — that filter is what stops one activity's session id being usable against another's
endpoint.

**Also still owed from the plan:** `__tests__/lib/llmActivityQueries.test.ts` covering
`nextUnansweredStoryPosition` (pure) and `loadUserStoryPool`'s level filter, built with a locally
constructed fake client (the `__tests__/lib/instructorAuth.test.ts` shape, which
`__tests__/lib/activityTypes.test.ts` from Commit 2 already copies).

---

## Story 10 — Serve both activity kinds from the `[slug]` pages

> **As a student, I want an instructor's LLM-graded activity to appear and play from the same
> activity pages as every other activity, so that there is no separate URL or flow to discover.**

Closes **AC #2, #4 and #6**. This is the commit that actually unlocks the student flow, and it must
be atomic — the new pages and the deletion of the old ones cannot land separately.

**Acceptance criteria**
- [ ] `app/activities/[slug]/page.tsx` and `.../play/page.tsx` branch on
      `activity.gradingKind === 'llm-graded'` and render the LLM views for it.
- [ ] `app/activities/write-acceptance-criteria/{page,play/page}.tsx` are deleted, and
      `/activities/write-acceptance-criteria` still resolves (via the retained `ACTIVITIES` entry).
- [ ] `app/api/activities/write-acceptance-criteria/**` and the three old test files are deleted in
      the same commit.
- [ ] A student not enrolled in the linked course cannot start the activity (403 from the session
      route's `checkActivityAccess`).
- [ ] `npm run build` is clean. There are no React tests in this project by design — the build is
      the only gate for this commit.

**Extract four components, each a near-verbatim move:**

| new component | source | what changes |
|---|---|---|
| `components/QuizActivityDetail.tsx` | `app/activities/[slug]/page.tsx` body | nothing; `useResolvedActivity` moves up to the route file and `activity` becomes a prop |
| `components/LlmActivityDetail.tsx` | **`QuizActivityDetail`**, *not* the WAC page | `loadCurrentSession`→`loadCurrentLlmSession`, `startSession`→`startOrResumeLlmSession`, `current.questions.length`/`current.answers.length`→`current.stories.length`/`current.answeredCount` |
| `components/QuizPlayView.tsx` | `app/activities/[slug]/play/page.tsx` body | nothing |
| `components/LlmPlayView.tsx` | WAC play page body | hardcoded `/activities/write-acceptance-criteria` targets → `/activities/${activity.slug}`; `submitAcceptanceCriteria`→`submitLlmAnswer(token, activity.activityType, …)`; `loadCompletedAttempts(…, 'WRITE_ACCEPTANCE_CRITERIA', …)` → `activity.activityType` |

**Deriving `LlmActivityDetail` from the quiz landing page rather than the WAC page is the
load-bearing decision.** It is what gives LLM activities level progression, the `?level=` seed, a
real `highestSelectableLevel` on `LevelReplaySelector`, and the GitHub #371 unlock animation for
free. It drops the WAC page's three hardcoded compromises: the fixed `Easy · Level 1` badge, the
dead `highestSelectableLevel={1} onSelect={() => {}}` selector, and
`<CompletedAttemptsTable showLevel={false} />` (which becomes the default `true`).

**Client wrappers to rename/parameterize** in `lib/llmActivityClient.ts` — the function names were
deliberately left alone in Commit 8 so the rename lands together with the real signature change:

```ts
startOrResumeLlmSession(token, activityType, options: { difficultyLevel?: number } = {})
loadCurrentLlmSession(token, activityType)
submitLlmAnswer(token, activityType, sessionId, userStoryId, submittedText)
```

All three `encodeURIComponent(activityType)`. `difficultyLevel` is forwarded **only when passed**,
matching `sessionClient.startSession`, so a plain Start is unaffected.

**One correctness fix while moving `LlmPlayView`:** `isLastStory` compares against
`STORIES_PER_SESSION - 1`; change it to `stories.length - 1` so a short-pool session can't get stuck
on a "Next story →" button.

Both route files then collapse to: `useRequireRole('student')` → `useResolvedActivity` → the existing
loading / not-found / forbidden branches → the kind branch. The `<Suspense>` wrapper on the detail
page stays where it is (`useSearchParams` prerender constraint).

---

## Story 11 — Scope the instructor reads by grading kind

> **As an instructor, I want each student attempt to appear exactly once on my dashboard, so that
> adding a second LLM-graded activity doesn't double-count or silently pool results.**

**Acceptance criteria**
- [ ] The instructor dashboard shows every attempt exactly once: MCQ as a session row, LLM-graded as
      a submission row.
- [ ] AC statistics can be scoped to one activity type; omitting the parameter keeps today's exact
      numbers.
- [ ] Activity filters list the activity types actually present, not a hardcoded three.
- [ ] Verified **against a real database**, not only unit tests (see the warning below).

**5a — `lib/sessionQueries.ts`'s `loadAllStudentActivity`.** Replace
`.neq('activity_type', 'WRITE_ACCEPTANCE_CRITERIA')` with a grading-kind filter:

```ts
.select(`${SESSION_COLUMNS}, ${STUDENT_EMBED}, catalog:activity_type!inner ( grading_kind )`)
.eq('student.role', 'student')
.eq('catalog.grading_kind', 'mcq')
```

Destructure `catalog` off in the `.map()` next to `student` (both are query inputs, not payload —
the existing comment covers this and just needs `catalog` added).

> ⚠️ **This is the single riskiest change in the whole issue.** `!inner` is mandatory: a non-inner
> embed nulls the field instead of dropping the row, and `.eq('catalog.grading_kind', …)` would then
> silently drop *everything*, emptying the instructor dashboard. The test harness no-ops `.eq`, so
> **no unit test can catch a wrong filter path.** If it needs de-risking further, an acceptable
> interim is keeping the `.neq` and adding a second one per known LLM type — ugly, but it cannot
> silently empty the dashboard.

Why it stays correct: `app/instructor/page.tsx` merges these session rows with
`loadInstructorACSubmissions`, which reads *all* `submission` rows regardless of type. After the
change: session rows = every mcq activity, submission rows = every llm-graded activity.

`loadStudentActivityForIds` keeps including every activity type (its docblock already says why —
the CSV export has no second AC source to double against); only reword
"WRITE_ACCEPTANCE_CRITERIA" → "llm-graded activities".

**5b — `lib/llmActivityStatisticsQueries.ts`.** `computeAcceptanceCriteriaStatistics` reads
`submission` and `user_story` with *no* activity filter, so a second LLM activity would silently pool
into the same average and pass rate — an invisible failure, not a loud one. Add an optional
`activityType` parameter (`.eq('activity_type', …)` on `user_story`; `story:user_story!inner(activity_type)`
+ `.eq('story.activity_type', …)` on `submission`, which needs the FK from Commit 1), passed through
from `GET /api/instructor/acceptance-criteria/statistics?activityType=`. **Absent = unfiltered =
today's behavior**, so dashboard numbers don't move on day one. Rename to
`computeLlmActivityStatistics` while there.

**5c — `components/InstructorActivityStats.tsx:31`.** `activity.slug === 'write-acceptance-criteria'`
→ `activity.gradingKind === 'llm-graded'`. Record two caveats in the docblock rather than fixing them
here: it iterates the static `ACTIVITIES` array so it has never rendered instructor-created catalogs
(pre-existing gap), and with two LLM activities it shows the same participation number on both cards
(the real fix is a `Record<activityType, …>` prop fed by 5b — out of scope).

**5d — filters and log rows.**
- `components/ActivityFilters.tsx`: `ACTIVITY_OPTIONS` is a hardcoded three-item list, so every
  custom catalog since #347 is unfilterable. Take an `options` prop the caller derives from the
  entries in hand (`[...new Set(entries.map(e => e.activityType))]`, labelled with
  `entry.activityName`), prepending `'all'` inside. Callers: `app/dashboard/log/page.tsx`,
  `app/instructor/page.tsx`.
- `lib/activityLogTypes.ts`'s `toAcSubmissionRow` hardcodes `activityType`, the display name and
  `maxScore: 10`. Add `activityType: string` to `InstructorACSubmission` (source: the submissions
  route's existing `story:user_story!inner(...)` join, just add `activity_type` — no new query); use
  `getActivityByType(...)?.name ?? submission.activityType`; take `maxScore` from `STORY_MAX_SCORE`.
  **Leave `kind: 'ac-submission'` alone** — it is an internal discriminant in `ActivityLogRow`'s
  switch, and renaming it is churn with a real chance of missing a branch.

**Tests to touch:** `instructor-activities`, `instructor-ac-statistics`,
`__tests__/lib/activityLogTypes.test.ts`.

---

## Story 12 — Update CLAUDE.md

> **As the next developer on this repo, I want CLAUDE.md to describe the two activity kinds
> accurately, so that I don't build against a structure that no longer exists.**

Not optional. CLAUDE.md currently describes WAC as a "fourth, structurally different activity" with
its own routes, and names `grading_kind` as "schema-only, not read anywhere" — both false afterwards.

**Acceptance criteria** — at minimum these passages are corrected:
- [ ] The "Half-connected worlds" WAC paragraph (own routes, own pages → one generic flow).
- [ ] The "Two schema-only additions" paragraph — `grading_kind` is read now; only
      `assembled_quiz_extra_question` remains unwired.
- [ ] The "no `POST` for `user_story`" note — that route exists now, with PATCH and DELETE.
- [ ] The five renamed `lib/acceptanceCriteria*` modules, and the deliberate exception for
      `acceptanceCriteriaSubmissionsStore.ts` / the `/api/instructor/acceptance-criteria/*` paths.
- [ ] The "Reading sessions: which route answers which question" table — add the
      `[activityType]/llm/*` routes.
- [ ] The Styling Guidelines component list — `PromptFormModal`, `CatalogPromptCard`.

---

## Verification (end to end, after Story 10 at the earliest)

```bash
npm test                 # all vitest suites
npm run build            # the only type check
npm run dev              # http://localhost:3000
```

In the Supabase SQL console first: apply the FK from Commit 1 (after running its verify-first
`SELECT`, see the schema footer) and re-seed the `user_story` block.

1. As instructor: configure an LLM provider under *Settings* with a real API key. **Skipping this is
   the most common false alarm** — step 7 will 500 without it.
2. *Question Catalogs* → "Create catalog": confirm **Create stays disabled** until a type is picked
   (AC #1). Choose "LLM-Graded Task" + one of your own courses.
3. Open the catalog → Edit → "New Prompt": add **≥4 prompts each on level 1 and level 2**. The
   coverage banner should clear for a level once it reaches 4.
4. Edit one prompt; delete an unused one (AC #3).
5. AC #2 check: `SELECT grading_kind FROM activity_type WHERE activity_type = '<key>'` → `llm-graded`;
   `SELECT * FROM question WHERE activity_type = '<key>'` → empty.
6. As a student **not** enrolled: `/activities` omits it; visiting `/activities/<key>` directly hits
   the forbidden branch (AC #4).
7. As an enrolled student: start, write free text, get a 1–10 score + feedback, finish all 4 prompts,
   see the summary. `SELECT status, difficulty_level, cumulative_score, passed FROM session_log
   WHERE activity_type = '<key>'` → `completed`, score summed by the trigger (AC #6).
8. Resume: close the tab after prompt 2, reopen → *Resume* lands on prompt 3.
9. Level progression: after passing level 1, the detail page shows level 2 unlocked (with the unlock
   animation) and the next start draws level-2 prompts.
10. AC #5 check: create an MCQ catalog, add a question, play it as a student — unchanged. On the
    instructor dashboard, every attempt appears **exactly once**.
