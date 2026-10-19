import { describe, it, expect } from 'vitest'
import { noteFor, setNote, NOTE_MAX } from './notes.js'

describe('exercise notes', () => {
  it('reads nothing from a state without notes', () => {
    expect(noteFor({}, 'x')).toBe('')
    expect(noteFor({ exNotes: {} }, 'x')).toBe('')
    expect(noteFor(null, 'x')).toBe('')
  })
  it('saves, trims and dates a note', () => {
    const s = {}
    expect(setNote(s, 'bench', '  seat on 4 \r\n grip wide  ', '2026-10-19')).toBe('seat on 4 \n grip wide')
    expect(s.exNotes.bench).toEqual({ text: 'seat on 4 \n grip wide', d: '2026-10-19' })
    expect(noteFor(s, 'bench')).toBe('seat on 4 \n grip wide')
  })
  it('replaces an existing note and keeps the others', () => {
    const s = { exNotes: { a: { text: 'old', d: '2026-01-01' }, b: { text: 'keep', d: '2026-01-01' } } }
    setNote(s, 'a', 'new', '2026-10-19')
    expect(noteFor(s, 'a')).toBe('new')
    expect(noteFor(s, 'b')).toBe('keep')
  })
  it('removes the note when cleared', () => {
    const s = { exNotes: { a: { text: 'x', d: '2026-01-01' } } }
    expect(setNote(s, 'a', '   ')).toBe('')
    expect('a' in s.exNotes).toBe(false)
  })
  it('caps the length', () => {
    const s = {}
    expect(setNote(s, 'a', 'x'.repeat(NOTE_MAX + 50)).length).toBe(NOTE_MAX)
  })
  it('ignores malformed stored values', () => {
    expect(noteFor({ exNotes: { a: 'plain string' } }, 'a')).toBe('')
  })
})
