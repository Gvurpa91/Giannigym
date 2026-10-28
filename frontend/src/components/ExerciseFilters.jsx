// Body-part and equipment filters for the exercise picker and the library.
//
// Built for thumbs: two large buttons side by side, each opening a vertical list with big
// rows and a count per option. This replaces two sideways-scrolling chip strips, which hid
// most options off-screen and fought the bottom sheet's swipe-to-dismiss. Two compact
// buttons also keep the picker's pinned header short, so the list gets the screen.
import { useUI } from '../store/useUI.js'
import { BODYPARTS } from '../lib/exercises.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

export function countBy(list, key) {
  const c = {}
  list.forEach(e => { const v = e[key]; if (v) c[v] = (c[v] || 0) + 1 })
  return c
}

// rows: [{ value, label, count, icon? }]
function openOptionList(title, rows, value, onChange) {
  useUI.getState().openSheet(close => <>
    <h3>{title}</h3>
    <div className="sect-b">
      {rows.map(r => <button key={r.value || '_all'} className="lrow tap" onClick={() => { close(); onChange(r.value) }}>
        <span className="lrow-m"><span className={'lrow-t' + (r.value && r.value !== '★' ? ' capitalize' : ' nocap')}>
          {r.icon && <Icon name={r.icon} style={{ fontSize: 13, marginRight: 6, verticalAlign: '-1px', color: 'var(--acc)', display: 'inline-block' }} />}{r.label}</span></span>
        {r.count != null && <span className="lrow-v">{r.count}</span>}
        {value === r.value && <Icon name="check" className="lrow-k" />}
      </button>)}
    </div>
    <div style={{ height: 8 }} />
  </>)
}

/**
 * @param bp        '' = all, '★' = chosen, otherwise a body part
 * @param bpBase    exercises matching the search only (for the body-part counts)
 * @param usage     { [exId]: n } exercises already used, for the "Chosen" option (picker only)
 * @param eq        selected equipment ('' = any), already reconciled with `eqOpts`
 * @param eqOpts    equipment values present in the current body-part/search result
 * @param base      that result, for the per-equipment counts
 * @param count     how many exercises the filters leave
 */
// Body parts most people look for first; neck has two exercises and goes last.
const ORDER = ['chest', 'back', 'upper legs', 'shoulders', 'upper arms', 'waist', 'lower legs', 'lower arms', 'cardio', 'neck']
const PARTS = [...ORDER.filter(b => BODYPARTS.includes(b)), ...BODYPARTS.filter(b => !ORDER.includes(b))]

// Body parts are a grid of big tiles — every option visible, one tap each. Equipment is a
// secondary refinement, so it stays a single button opening a list.
export default function ExerciseFilters({ bp, onBp, bpBase, usage, eq, onEq, eqOpts, base, count }) {
  const bpCounts = countBy(bpBase, 'bp')
  const tiles = [
    { value: '', label: t('All') },
    ...(usage && Object.keys(usage).length ? [{ value: '★', label: t('Chosen'), icon: 'starFill' }] : []),
    ...PARTS.filter(b => bpCounts[b] || b === bp).map(b => ({ value: b, label: t(b) })),
  ]
  const eqCounts = countBy(base, 'eq')
  const openEq = () => openOptionList(t('Equipment'), [
    { value: '', label: t('Any equipment'), count: base.length },
    ...eqOpts.map(x => ({ value: x, label: t(x), count: eqCounts[x] || 0 })),
  ], eq, onEq)
  return <div className="xfilters">
    <div className="bptiles" role="group" aria-label={t('Body part')}>
      {tiles.map(x => <button key={x.value || '_all'} aria-pressed={bp === x.value} className={bp === x.value ? 'on' : ''} onClick={() => onBp(x.value)}>
        {x.icon && <Icon name={x.icon} />}<span className="capitalize">{x.label}</span></button>)}
    </div>
    <div className="eqrow">
      <span className="small dim">{t('{0} exercises', count ?? base.length)}</span>
      <button className={'eqbtn' + (eq ? ' on' : '')} onClick={openEq}>
        <span className="capitalize">{t('Equipment')}: {eq ? t(eq) : t('All').toLowerCase()}</span><Icon name="chevronDown" />
      </button>
    </div>
  </div>
}
