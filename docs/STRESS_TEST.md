# Stress test

Results of the stress test run on 21 October 2026, and how to repeat it. Everything below ran
in a cloud container: the API on Node 22, the app in headless Chromium with an iPhone 13
viewport. iOS Safari itself was not available, so iPhone-specific behaviour (the keyboard,
storage limits in WebKit) is covered only where Chromium behaves the same way.

## How to run it

```bash
# API: boots the real server on a temporary data folder with 50 users
cd api && npm ci && node ../scripts/stress/api-stress.mjs . 50

# App: a profile with N workouts on a CPU slowed down 4x (roughly a phone)
cd frontend && npm run build && npx vite preview --port 4173 &
node scripts/stress/ui-stress.mjs 1000 4

# Program builder: every combination the questionnaire allows (runs with npm test)
cd frontend && npx vitest run src/lib/program-builder.stress.test.js
```

## API

| Check | Result |
|---|---|
| 2000 health requests, 50 at a time | all 200, median 18 ms, p99 72 ms |
| 500 saves of a 2-year history (441 KB each), 25 at a time | all 200, no corrupt files, no leftover temp files |
| 500 reads, 25 at a time | all 200 |
| 200 simultaneous saves by one user | all 200, final file holds exactly one payload |
| 4.2 MB save (under the 5 MB limit) | 200 |
| 5.3 MB save (over the limit) | **was** connection reset, **now** 413 |
| Malformed JSON | **was** 500, **now** 400 |
| Missing, forged, expired cookie; path traversal in the user id | 401 |
| 3000 mixed requests, 60 at a time | all 200, 134 req/s, memory 106 → 180 MB |

## App, 1000 workouts (≈7 years of 2–3 sessions a week), CPU ×4

| Screen or action | Before | After |
|---|---|---|
| History | 1596 ms | 138 ms (40 at a time, "Show more") |
| Tap a set as done | 277–511 ms | 148–193 ms |
| Stats | 229 ms | about the same |
| Home, Plan, Exercises | under 300 ms | unchanged |

Where the tap time went: every change copied the whole state, serialised it and wrote it to
browser storage. Now the copy remains (the JSON round trip measured faster than
`structuredClone`), while the write happens once, 300 ms after the last change, and right
away when the app is hidden or the page closes.

With a realistic profile (100 workouts a year) every screen and tap stays well under 100 ms.

## Full browser storage

Chromium allowed about 4.9 million characters; a 1000-workout profile takes 1.65 million.
When storage was full, a change used to throw out of the save and **was lost on screen too**.
Now the change applies, the server copy is still sent for signed-in profiles, and the app says
once that the device is out of space (and, for guest profiles, to export a backup).

## Program builder

All 1800 questionnaire combinations (5 goals × 3 levels × 1–6 days × 5 session lengths × 4
equipment presets), plus each of the 14 most common pieces of equipment on its own: no errors,
no session over its length, no equipment the user does not have, no exercise repeated within
a day, and every plan survives the share/import round trip. Body-weight exercises are always
allowed by design, so a pull-up can appear for someone who only ticked dumbbells; put it on
the "exercises to leave out" list if there is no bar.
