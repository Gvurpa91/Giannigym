import { describe, it, expect } from 'vitest'
import { shouldDismiss, trackVelocity, DISMISS_DISTANCE } from './gesture.js'

describe('sheet swipe-to-dismiss', () => {
  it('closes on a long drag, whatever the speed', () => {
    expect(shouldDismiss({ delta: DISMISS_DISTANCE, velocity: 0 })).toBe(true)
    expect(shouldDismiss({ delta: 200, velocity: 0.05 })).toBe(true)
  })
  it('closes on a short quick flick', () => {
    expect(shouldDismiss({ delta: 40, velocity: 1.1 })).toBe(true)
    expect(shouldDismiss({ delta: 25, velocity: 0.5 })).toBe(true)
  })
  it('springs back on a short slow drag', () => {
    expect(shouldDismiss({ delta: 50, velocity: 0.1 })).toBe(false)
  })
  it('ignores a tiny twitch even if fast', () => {
    expect(shouldDismiss({ delta: 8, velocity: 2 })).toBe(false)
  })
  it('never closes on an upward gesture', () => {
    expect(shouldDismiss({ delta: -120, velocity: 3 })).toBe(false)
    expect(shouldDismiss({ delta: 0, velocity: 3 })).toBe(false)
  })
  it('scales the distance down for short sheets', () => {
    expect(shouldDismiss({ delta: 70, velocity: 0, height: 200 })).toBe(true)
    expect(shouldDismiss({ delta: 50, velocity: 0, height: 200 })).toBe(false)
  })
  it('tracks velocity in px per ms', () => {
    let s = trackVelocity(null, 100, 0)
    s = trackVelocity(s, 120, 10)
    s = trackVelocity(s, 140, 20)
    expect(s.v).toBeCloseTo(1.79, 1)
    expect(trackVelocity(s, 150, 20).v).toBe(s.v)
  })
})
