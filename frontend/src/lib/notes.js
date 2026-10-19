// Per-exercise notes ("seat on 4", "left shoulder: go lighter", "use the blue cable").
//
// A note belongs to the exercise, not to one session: it lives in synced state as
// S.exNotes[exId] = { text, d } and shows up again every time that exercise comes round.
// When a workout is finished the note in force is also stamped onto that workout's entry,
// so history shows what you had written at the time even after you change it.
import { todayISO } from './format.js'

export const NOTE_MAX = 500

export function noteFor(S, exId) {
  const n = S && S.exNotes && S.exNotes[exId]
  return (n && typeof n.text === 'string') ? n.text : ''
}

/** Mutates a draft state. An empty or whitespace-only text removes the note. */
export function setNote(s, exId, text, today = todayISO()) {
  const v = String(text || '').replace(/\r\n?/g, '\n').trim().slice(0, NOTE_MAX)
  if (!s.exNotes || typeof s.exNotes !== 'object') s.exNotes = {}
  if (!v) { delete s.exNotes[exId]; return '' }
  s.exNotes[exId] = { text: v, d: today }
  return v
}
