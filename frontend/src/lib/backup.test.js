import { describe, it, expect } from 'vitest'
import { backupDue, daysBetween, backupName, BACKUP_EVERY_DAYS } from './backup.js'

const ws = dates => dates.map(d => ({ d, entries: [] }))

describe('backup reminder', () => {
  it('counts days between ISO dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
  })
  it('stays quiet before there is anything to lose', () => {
    expect(backupDue({ workouts: ws(['2026-01-01', '2026-01-03']) }, '2026-10-21')).toBe(false)
    expect(backupDue({}, '2026-10-21')).toBe(false)
  })
  it('asks a month after the first workout when no backup was ever made', () => {
    const S = { workouts: ws(['2026-09-01', '2026-09-03', '2026-09-08']) }
    expect(backupDue(S, '2026-09-30')).toBe(false)
    expect(backupDue(S, '2026-10-01')).toBe(true)
  })
  it('asks again a month after the last backup', () => {
    const S = { workouts: ws(['2026-01-01', '2026-01-02', '2026-01-03']), lastBackup: '2026-10-01' }
    expect(backupDue(S, '2026-10-21')).toBe(false)
    expect(backupDue(S, '2026-10-31')).toBe(true)
  })
  it('respects a snooze until its date', () => {
    const S = { workouts: ws(['2026-01-01', '2026-01-02', '2026-01-03']), backupSnooze: '2026-10-28' }
    expect(backupDue(S, '2026-10-21')).toBe(false)
    expect(backupDue(S, '2026-10-28')).toBe(true)
  })
  it('uses the reminder period it advertises', () => {
    expect(BACKUP_EVERY_DAYS).toBe(30)
    expect(backupName('2026-10-21')).toMatch(/-backup-2026-10-21\.json$/)
  })
})
