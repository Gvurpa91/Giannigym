// Body measurements alongside body weight.
//
// For someone losing fat while building muscle the scale can stand still while the waist
// shrinks, so the waist is the number worth watching. Entries live in synced state as
// S.measures = [{ d: 'YYYY-MM-DD', waist?, hips?, chest?, arm?, thigh? }], one per day, always
// stored in centimetres; profiles that use pounds see and type inches.
import { todayISO } from './format.js'

export const SITES = ['waist', 'hips', 'chest', 'arm', 'thigh']
export const SITE_LABEL = { waist: 'Waist', hips: 'Hips', chest: 'Chest', arm: 'Arm', thigh: 'Thigh' }
const IN = 2.54
const MIN_CM = 10, MAX_CM = 300

export const lengthUnit = weightUnit => (weightUnit === 'lb' ? 'in' : 'cm')
export const toDisplay = (cm, weightUnit) => (cm == null ? null : Math.round((weightUnit === 'lb' ? cm / IN : cm) * 10) / 10)
export const fromDisplay = (v, weightUnit) => (v == null || !(v > 0) ? null : Math.round((weightUnit === 'lb' ? v * IN : v) * 10) / 10)

/**
 * Merges one day's readings into a draft state. Values are in the display unit; a null or
 * empty value clears that site for the day, and a day left with nothing is removed.
 * Readings outside 10–300 cm are ignored as typos.
 */
export function setMeasures(s, values, weightUnit = 'kg', d = todayISO()) {
  if (!Array.isArray(s.measures)) s.measures = []
  let row = s.measures.find(m => m.d === d)
  if (!row) { row = { d }; s.measures.push(row) }
  for (const k of SITES) {
    if (!(k in values)) continue
    const cm = fromDisplay(values[k], weightUnit)
    if (cm == null) delete row[k]
    else if (cm >= MIN_CM && cm <= MAX_CM) row[k] = cm
  }
  if (!SITES.some(k => row[k] != null)) s.measures = s.measures.filter(m => m !== row)
  s.measures.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
  return row
}

export function deleteMeasures(s, d) {
  s.measures = (s.measures || []).filter(m => m.d !== d)
}

/** Points for one site, in the display unit. */
export function series(S, site, weightUnit = 'kg') {
  return (S.measures || []).filter(m => m[site] != null).map(m => ({ d: m.d, t: Date.parse(m.d), y: toDisplay(m[site], weightUnit) }))
}

/** Latest reading per site, in the display unit (for prefilling the form). */
export function latest(S, weightUnit = 'kg') {
  const out = {}
  for (const m of S.measures || []) for (const k of SITES) if (m[k] != null) out[k] = toDisplay(m[k], weightUnit)
  return out
}

/** Sites that have at least one reading, waist first. */
export const sitesWithData = S => SITES.filter(k => (S.measures || []).some(m => m[k] != null))

/** Change over the last `days` for a site: newest reading minus the oldest one inside the window. */
export function change(S, site, days = 30, weightUnit = 'kg', today = todayISO()) {
  const from = Date.parse(today) - days * 86400000
  const pts = series(S, site, weightUnit).filter(p => p.t >= from)
  if (pts.length < 2) return null
  return Math.round((pts[pts.length - 1].y - pts[0].y) * 10) / 10
}
