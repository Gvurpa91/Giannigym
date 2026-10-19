// Swipe-to-dismiss decision for bottom sheets.
//
// A sheet closes on a long enough drag *or* on a quick downward flick: people flick a sheet
// away with a short, fast gesture far more often than they drag it 90 px, and a flick that
// springs back reads as a bug. `velocity` is px/ms at release (positive = downward).
export const DISMISS_DISTANCE = 90
export const FLICK_VELOCITY = 0.4
export const FLICK_MIN_DISTANCE = 20

export function shouldDismiss({ delta, velocity = 0, height = 0 }) {
  if (!(delta > 0)) return false
  const far = Math.min(DISMISS_DISTANCE, height > 0 ? height * 0.3 : DISMISS_DISTANCE)
  if (delta >= far) return true
  return delta >= FLICK_MIN_DISTANCE && velocity >= FLICK_VELOCITY
}

/** Exponentially smoothed velocity from successive samples; ignores out-of-order or zero-time samples. */
export function trackVelocity(prev, y, t) {
  if (!prev || t <= prev.t) return { y, t, v: prev ? prev.v : 0 }
  const inst = (y - prev.y) / (t - prev.t)
  return { y, t, v: prev.v * 0.3 + inst * 0.7 }
}
