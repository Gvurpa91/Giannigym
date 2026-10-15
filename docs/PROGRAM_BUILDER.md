# The program builder (no AI)

A deterministic, rule-based generator that turns a short questionnaire into a complete weekly
plan. It runs entirely in the browser: no server, no account, no AI provider, no cost. It works
in guest mode, in the demo build and in the standalone mobile build, and it is the default
"get me a plan" path on an instance where the AI Coach is off.

Entry points: **Home → Build my program**, **Plan → clipboard icon**, or `#/builder`.

## What it asks

| Step | Answer | How it is used |
|---|---|---|
| Goal | strength · muscle · fat loss · general fitness · endurance | rep ranges, progression policy, whether sessions end with conditioning |
| Experience | new · returning · regular | exercise selection floor (a beginner is never handed a front squat or a pull-up), exercise count cap, Greyskull on the main lifts for experienced strength training |
| Days per week | 1–6, with optional preferred weekdays | the split (see below) and the week schedule |
| Session length | 30–90 min | a per-set time budget, warm-up included |
| Equipment | presets (full gym, dumbbells, body weight, bands) or any set from the library's taxonomy | only exercises you can actually do are picked; "full gym" is the whole library |
| Exercises to leave out | ids picked from the library | never chosen, not even as alternatives |

Nothing free-text is stored. The answers are kept on the profile (`S.builderProfile`) so a
rebuild starts from them; if the AI Coach is later enabled its intake starts from the same answers.

## How a plan is built (`frontend/src/lib/program-builder.js`)

1. **Split by days**: 1 → full body · 2 → full body A/B · 3 → full body A/B/C · 4 → upper/lower ×2 ·
   5 → upper/lower + push/pull/legs · 6 → push/pull/legs ×2.
2. **Each day is a list of movement-pattern slots** with a role: *main* (heaviest compound,
   never dropped), *second* (compound) or *accessory*. Patterns: squat, hip hinge, horizontal and
   vertical push, horizontal and vertical pull, single-leg, core, shoulders, biceps, triceps,
   calves, conditioning.
3. **Each pattern has a ranked candidate list** of library exercises. The first candidate that is
   in the library, allowed by the equipment, not avoided, not already in the routine and at or
   above the person's experience floor is picked. If nothing fits, the neighbouring pattern
   stands in (vertical pull → horizontal pull, and so on) before the experience floor is relaxed.
4. **Time budget**: session length minus warm-up (5 min, 8 min from 60 min up). A set costs
   3 min (main), 2.5 min (second) or 1.75 min (accessory, 1.25 min when supersetted), rest
   included. Slots are filled in order until the budget runs out; an accessory that does not fit
   with 3 sets is tried with 2, then dropped. Mains are never dropped. Fat-loss and endurance
   goals, and sessions of 45 min or less, superset consecutive accessories. If the goal asks for
   a conditioning finisher and at least 6 minutes are left, one is added.
5. **Scheme by goal and role** — for example strength mains are 5×5 linear (Greyskull for
   experienced lifters), muscle accessories are 3×10–12 double progression, endurance mains are
   3×10–12. Core is always high-rep. The engine (`lib/progression.js`) owns the loads from
   session to session; the builder never sets a starting weight.
6. **Every pick carries a reason** (`why`) in the user's language and up to three **alternatives**
   (`alt`) from the same pattern.

The output is a plan bundle in the share format (`opengym_plan: 1`), so applying it is the
ordinary import path: `parsePlan` → `mergePlan`. Routines are added next to existing ones; the
weekly schedule optionally replaces the current one.

## What it does not do

- It does not look at your history. It builds from your answers only; reviewing what you
  actually logged is the AI Coach's job (or yours, in the Plan tab).
- It does not give medical advice and it promises no result. Pain is not a parameter: the
  questionnaire tells you to see a professional and lets you exclude exercises.
- It cannot burn belly fat on its own, and it says so when you pick fat loss.

## Editing the result

On the preview screen each exercise can be swapped for one of its alternatives (keeping its
sets and reps) or removed; a superset left without a partner is unlinked. After applying, the
routines are ordinary routines: sets, reps, progression policy, supersets and order are all
editable in the Plan tab.

## Tests

`frontend/src/lib/program-builder.test.js` covers: every catalogue id resolves; a 2-day,
60-minute, full-gym plan covers all fundamental patterns, fits the hour and has 5–7 exercises
per session; equipment filters (dumbbells only, body weight only); experience floors; goal
schemes and the finisher; preferred-day scheduling; the avoid list in picks and alternatives;
swap and remove; determinism; round-trip through `parsePlan`/`mergePlan`.
