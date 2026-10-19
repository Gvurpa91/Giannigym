// Weight-picker limits and parsing.
//
// Working weights (the post-exercise confirmation) keep a wide ceiling — a deadlift can pass
// 200 kg. Body weight and the goal weight top out at 200 kg / 440 lb, which keeps the slider's
// range short and makes typos like 720 impossible.
export const wHi = unit => (unit === 'lb' ? 660 : 300)
export const bwHi = unit => (unit === 'lb' ? 440 : 200)

/** "72,5" and "72.5" both read as 72.5; anything that is not a positive number gives null. */
export function parseWeight(text) {
  const n = parseFloat(String(text ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}
