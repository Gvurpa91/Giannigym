import { describe, it, expect } from 'vitest'
import { wHi, bwHi, parseWeight } from './weight.js'

describe('weight picker', () => {
  it('caps body weight at 200 kg / 440 lb and working weight higher', () => {
    expect(bwHi('kg')).toBe(200)
    expect(bwHi('lb')).toBe(440)
    expect(wHi('kg')).toBeGreaterThan(200)
  })
  it('reads typed weights with a comma or a dot', () => {
    expect(parseWeight('72,5')).toBe(72.5)
    expect(parseWeight(' 80.4 ')).toBe(80.4)
    expect(parseWeight('90')).toBe(90)
  })
  it('rejects empty, zero, negative and junk input', () => {
    expect(parseWeight('')).toBe(null)
    expect(parseWeight('0')).toBe(null)
    expect(parseWeight('-3')).toBe(null)
    expect(parseWeight('abc')).toBe(null)
    expect(parseWeight(null)).toBe(null)
  })
})
