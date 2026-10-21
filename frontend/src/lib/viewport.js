// iOS keeps `position: fixed` elements (the tab bar, the rest timer) glued to a layout
// viewport that it sometimes forgets to move back: after the on-screen keyboard closes, or
// after the page was scroll-locked under a sheet, the tab bar can be left floating halfway
// up the screen until the next reload. Nudging the scroll position by zero once the
// keyboard has gone makes WebKit recompute where "bottom: 0" is.
let installed = false

// A zero-distance scrollTo can be dropped as a no-op, so move one pixel and come back on
// the next frame — too short to see, enough for WebKit to lay the fixed elements out again.
export function realignFixed() {
  if (typeof window === 'undefined') return
  requestAnimationFrame(() => {
    const x = window.scrollX, y = window.scrollY
    window.scrollTo(x, y > 0 ? y - 1 : y + 1)
    requestAnimationFrame(() => window.scrollTo(x, y))
  })
}

export function installViewportFix() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const isField = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  // Keyboard closing: focus leaves a text field and does not land on another one.
  document.addEventListener('focusout', e => {
    if (!isField(e.target)) return
    setTimeout(() => { if (!isField(document.activeElement)) realignFixed() }, 120)
  })
  // The visual viewport grows back to full height when the keyboard is dismissed by swipe.
  const vv = window.visualViewport
  if (vv) {
    let last = vv.height
    vv.addEventListener('resize', () => {
      if (vv.height > last + 80) setTimeout(realignFixed, 60)
      last = vv.height
    })
  }
  // Coming back to the app (switching apps, unlocking the phone) can leave the same offset.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(realignFixed, 60) })
}
