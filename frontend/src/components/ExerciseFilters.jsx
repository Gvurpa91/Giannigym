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

function FilterButton({ icon, label, value, active, onClick, onClear, clearLabel }) {
  return <div className="fbtn-w">
    <button className={'fbtn' + (active ? ' on' : '')} onClick={onClick}>
      <Icon name={icon} className="fbtn-i" />
      <span className="fbtn-m"><span className="fbtn-l">{label}</span><span className="fbtn-v capitalize">{value}</span></span>
      {active
        ? <span className="fbtn-x" role="button" aria-label={clearLabel} onClick={e => { e.stopPropagation(); onClear() }}><Icon name="xmark" /></span>
        : <Icon name="chevronDown" className="fbtn-c" />}
    </button>
  </div>
}

/**
 * @param bp        '' = all, '★' = chosen, otherwise a body part
 * @param bpBase    exercises matching the search only (for the body-part counts)
 * @param usage     { [exId]: n } exercises already used, for the "Chosen" option (picker only)
 * @param eq        selected equipment ('' = any), already reconciled with `eqOpts`
 * @param eqOpts    equipment values present in the current body-part/search result
 * @param base      that result, for the per-equipment counts
 */
export default function ExerciseFilters({ bp, onBp, bpBase, usage, eq, onEq, eqOpts, base }) {
  const bpCounts = countBy(bpBase, 'bp')
  const chosen = usage ? bpBase.filter(e => usage[e.id]).length : 0
  const openBp = () => openOptionList(t('Body part'), [
    ...(usage && Object.keys(usage).length ? [{ value: '★', label: t('Chosen'), count: chosen, icon: 'starFill' }] : []),
    { value: '', label: t('All'), count: bpBase.length },
    ...BODYPARTS.map(b => ({ value: b, label: t(b), count: bpCounts[b] || 0 })),
  ], bp, onBp)
  const eqCounts = countBy(base, 'eq')
  const openEq = () => openOptionList(t('Equipment'), [
    { value: '', label: t('Any equipment'), count: base.length },
    ...eqOpts.map(x => ({ value: x, label: t(x), count: eqCounts[x] || 0 })),
  ], eq, onEq)
  return <div className="xfilters">
    <FilterButton icon="figureStrength" label={t('Body part')} active={!!bp} onClick={openBp} onClear={() => onBp('')} clearLabel={t('All')}
      value={bp === '★' ? t('Chosen') : bp ? t(bp) : t('All')} />
    <FilterButton icon="dumbbell" label={t('Equipment')} active={!!eq} onClick={openEq} onClear={() => onEq('')} clearLabel={t('Any equipment')}
      value={eq ? t(eq) : t('All')} />
  </div>
}
