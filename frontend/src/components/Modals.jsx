import { useEffect, useRef } from 'react'
import { useUI } from '../store/useUI.js'
import { shouldDismiss, trackVelocity } from '../lib/gesture.js'
import { realignFixed } from '../lib/viewport.js'

// One bottom sheet (or centered dialog) with swipe-to-dismiss.
function Sheet({ sheet }) {
  const { closeSheet } = useUI()
  const ref = useRef(null)
  const drag = useRef({ startY: null })

  const onTouchStart = e => {
    const el = ref.current
    // a gesture that begins on a slider (or opted-out control) belongs to that control,
    // not to the sheet's swipe-to-dismiss — so it keeps working while you drag
    // A locked sheet (the pre-workout check-in) is closed only by its own buttons: no handle,
    // and it does not move under the finger, so it never looks like it can be swiped away.
    if (sheet.locked || (e.target.closest && e.target.closest('input[type=range], [data-nodrag]'))) {
      drag.current = { startY: null }
      return
    }
    const x = e.touches[0].clientX, y = e.touches[0].clientY
    // The axis is decided on the first real movement: a mostly-sideways gesture (a chip row,
    // a carousel) is left alone instead of half-dragging the sheet down while you scroll.
    drag.current = { startY: el.scrollTop <= 0 ? y : null, startX: x, delta: 0, axis: null, vel: trackVelocity(null, y, e.timeStamp) }
  }
  const onTouchMove = e => {
    const el = ref.current, d = drag.current
    if (d.startY === null) return
    const y = e.touches[0].clientY
    const dy = y - d.startY, dx = e.touches[0].clientX - d.startX
    d.vel = trackVelocity(d.vel, y, e.timeStamp)
    if (!d.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
        // Claim a downward start right away: if the browser begins its own overscroll here,
        // iOS stops letting us cancel the rest of the gesture and a quick flick is lost.
        if (dy > 0 && dy >= Math.abs(dx) && el.scrollTop <= 0) e.preventDefault()
        return
      }
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (d.axis === 'x') { d.startY = null; return }
    d.delta = dy
    if (d.delta > 0 && el.scrollTop <= 0) {
      e.preventDefault()
      el.style.transition = 'none'
      el.style.transform = `translateY(${d.delta}px)`
    } else d.delta = 0
  }
  const onTouchEnd = () => {
    const el = ref.current, d = drag.current
    if (d.startY === null) return
    el.style.transition = 'transform .2s'
    if (!sheet.locked && shouldDismiss({ delta: d.delta, velocity: d.vel ? d.vel.v : 0, height: el.offsetHeight })) {
      el.style.transform = 'translateY(110%)'; setTimeout(() => closeSheet(sheet.id), 180)
    } else el.style.transform = ''
    d.startY = null
  }

  // non-passive touchmove so preventDefault works (bottom sheets only; centered dialogs have no ref)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const close = () => closeSheet(sheet.id)
  if (sheet.kind === 'center') {
    return (
      <div>
        <div className="mback" onClick={() => { if (!sheet.locked) close() }} />
        <div className="center">{sheet.render(close)}</div>
      </div>
    )
  }
  return (
    <div>
      <div className="mback" onClick={() => { if (!sheet.locked) close() }} />
      <div className={"sheet" + (sheet.locked ? " locked" : "")} ref={ref} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { drag.current.delta = 0; onTouchEnd() }}>
        {!sheet.locked && <div className="grab" />}
        {sheet.render(close)}
      </div>
    </div>
  )
}

export default function Modals() {
  const sheets = useUI(s => s.sheets)

  // lock the page behind any open sheet (iOS-safe), then make WebKit recompute where the
  // fixed tab bar belongs once the page is unpinned (see lib/viewport.js)
  useEffect(() => {
    if (!sheets.length) return
    const y = window.scrollY || 0
    const b = document.body.style
    b.position = 'fixed'; b.top = -y + 'px'; b.left = '0'; b.right = '0'; b.width = '100%'
    return () => {
      b.position = b.top = b.left = b.right = b.width = ''
      window.scrollTo(0, y)
      realignFixed()
    }
  }, [sheets.length > 0])

  if (!sheets.length) return null
  return (
    <div id="modal-root" className="open">
      {sheets.map(s => <Sheet key={s.id} sheet={s} />)}
    </div>
  )
}
