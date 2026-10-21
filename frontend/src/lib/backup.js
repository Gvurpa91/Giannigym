// Backups the user keeps themselves.
//
// The server copy is the only one a self-hosted profile has unless someone exports it, and a
// free cloud instance can disappear. So the app keeps track of the last export (synced, so an
// export from any device counts) and asks again once a month. Exporting goes through the share
// sheet where the browser supports sharing files — on an iPhone home-screen app that is the
// way to "Save to Files" or iCloud; a plain download there opens a viewer you can't leave.
import { FILE_PREFIX } from './brand.js'
import { todayISO } from './format.js'
import { MOBILE, shareExport } from './mobile.js'

export const BACKUP_EVERY_DAYS = 30
export const SNOOZE_DAYS = 7
const MIN_WORKOUTS = 3   // nothing worth nagging about before a few sessions exist

const dayMs = 86400000
export const daysBetween = (fromISO, toISO) => Math.round((Date.parse(toISO) - Date.parse(fromISO)) / dayMs)

/** Should the Home screen ask for a backup today? */
export function backupDue(S, today = todayISO()) {
  const ws = (S && S.workouts) || []
  if (ws.length < MIN_WORKOUTS) return false
  if (S.backupSnooze && S.backupSnooze > today) return false
  const ref = S.lastBackup || ws.reduce((m, w) => (w.d < m ? w.d : m), ws[0].d)
  return daysBetween(ref, today) >= BACKUP_EVERY_DAYS
}

export const backupName = (today = todayISO()) => FILE_PREFIX + '-backup-' + today + '.json'

/** Hands the backup to the user. Resolves true when it went out, false if the share sheet was dismissed. */
export async function exportBackup(S) {
  const json = JSON.stringify(S, null, 2)
  const name = backupName()
  if (MOBILE) {
    try { await shareExport(json, name); return true } catch (e) { return false }
  }
  const file = typeof File === 'function' ? new File([json], name, { type: 'application/json' }) : null
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  if (file && touch && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true } catch (e) {
      if (e && e.name === 'AbortError') return false
      // fall through to a download if sharing itself failed
    }
  }
  const blob = new Blob([json], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return true
}
