import { describe, it, expect } from 'vitest'
import { setMeasures, deleteMeasures, series, latest, sitesWithData, change, toDisplay, fromDisplay, lengthUnit } from './measures.js'

describe('body measurements', () => {
  it('stores a day in centimetres and keeps one entry per day', () => {
    const s = {}
    setMeasures(s, { waist: 92.4 }, 'kg', '2026-10-01')
    setMeasures(s, { hips: 101 }, 'kg', '2026-10-01')
    expect(s.measures).toEqual([{ d: '2026-10-01', waist: 92.4, hips: 101 }])
  })
  it('keeps days sorted', () => {
    const s = {}
    setMeasures(s, { waist: 90 }, 'kg', '2026-10-10')
    setMeasures(s, { waist: 92 }, 'kg', '2026-10-01')
    expect(s.measures.map(m => m.d)).toEqual(['2026-10-01', '2026-10-10'])
  })
  it('clears a site with an empty value and drops an empty day', () => {
    const s = { measures: [{ d: '2026-10-01', waist: 90, arm: 35 }] }
    setMeasures(s, { arm: null }, 'kg', '2026-10-01')
    expect(s.measures).toEqual([{ d: '2026-10-01', waist: 90 }])
    setMeasures(s, { waist: '' }, 'kg', '2026-10-01')
    expect(s.measures).toEqual([])
  })
  it('ignores impossible readings', () => {
    const s = {}
    setMeasures(s, { waist: 920, arm: 3 }, 'kg', '2026-10-01')
    expect(s.measures).toEqual([])
  })
  it('converts inches for pound profiles', () => {
    expect(lengthUnit('lb')).toBe('in')
    expect(fromDisplay(36, 'lb')).toBe(91.4)
    expect(toDisplay(91.4, 'lb')).toBe(36)
    const s = {}
    setMeasures(s, { waist: 36 }, 'lb', '2026-10-01')
    expect(s.measures[0].waist).toBe(91.4)
    expect(series(s, 'waist', 'lb')[0].y).toBe(36)
  })
  it('builds series, latest values and the sites in use', () => {
    const S = { measures: [{ d: '2026-09-01', waist: 95 }, { d: '2026-10-01', waist: 92, arm: 36 }] }
    expect(series(S, 'waist').map(p => p.y)).toEqual([95, 92])
    expect(latest(S)).toEqual({ waist: 92, arm: 36 })
    expect(sitesWithData(S)).toEqual(['waist', 'arm'])
  })
  it('reports the change inside the window only', () => {
    const S = { measures: [{ d: '2026-08-01', waist: 99 }, { d: '2026-10-01', waist: 94 }, { d: '2026-10-20', waist: 92.5 }] }
    expect(change(S, 'waist', 30, 'kg', '2026-10-21')).toBe(-1.5)
    expect(change(S, 'waist', 90, 'kg', '2026-10-21')).toBe(-6.5)
    expect(change(S, 'hips', 30, 'kg', '2026-10-21')).toBe(null)
  })
  it('deletes a day', () => {
    const s = { measures: [{ d: '2026-10-01', waist: 90 }, { d: '2026-10-02', waist: 89 }] }
    deleteMeasures(s, '2026-10-01')
    expect(s.measures.map(m => m.d)).toEqual(['2026-10-02'])
  })
})
