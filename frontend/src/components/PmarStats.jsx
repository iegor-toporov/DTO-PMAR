import { forwardRef, useLayoutEffect, useRef } from 'react'
import { useLang } from '../LanguageContext'
import './PmarStats.css'

// ── Computation ───────────────────────────────────────────────────────────────

export function computeStats(rasterValues, colMin, colMax, rowMin, rowMax) {
  const vals = []
  for (let r = rowMin; r <= rowMax; r++)
    for (let c = colMin; c <= colMax; c++) {
      const v = rasterValues[r]?.[c]
      if (v > 0 && isFinite(v)) vals.push(v)
    }
  if (!vals.length) return null
  vals.sort((a, b) => a - b)
  const n    = vals.length
  const sum  = vals.reduce((s, v) => s + v, 0)
  const mean = sum / n
  const std  = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
  const pct  = (p) => vals[Math.min(n - 1, Math.floor(p * n))]
  return {
    n, mean, std,
    min: vals[0], max: vals[n - 1],
    median: pct(0.5),
    q25: pct(0.25), q75: pct(0.75),
    q90: pct(0.90), q95: pct(0.95), q99: pct(0.99),
  }
}

// ── Value formatter ───────────────────────────────────────────────────────────

function fmt(v) {
  if (!isFinite(v) || v === 0) return '—'
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'k'
  if (v >= 10)  return v.toFixed(1)
  return v.toFixed(3)
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export const PmarStatsModal = forwardRef(function PmarStatsModal(
  { result, mapTheme, onClose, stackIndex = 0 }, ref
) {
  const { t } = useLang()
  const c = t.toolsPanel
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, dx: 0, dy: 0 })

  useLayoutEffect(() => {
    const el = ref?.current
    if (!el) return
    const { width: elW, height: elH } = el.getBoundingClientRect()
    const { innerWidth: vw, innerHeight: vh } = window
    el.style.top    = `${vh - 68 - stackIndex * 24 - elH}px`
    el.style.left   = `${vw - 16 - stackIndex * 16 - elW}px`
    el.style.bottom = 'auto'
    el.style.right  = 'auto'
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = ref?.current
    if (!el) return
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('mouseup', onMouseUp)
    return () => {
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mouseup', onMouseUp)
    }
  }, [ref]) // eslint-disable-line react-hooks/exhaustive-deps

  // Drag via document (same pattern as PmarHistogramModal)
  useLayoutEffect(() => {
    function onMouseMove(e) {
      if (!dragRef.current.dragging) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      dragRef.current.dx = dx
      dragRef.current.dy = dy
      if (ref?.current) ref.current.style.transform = `translate(${dx}px, ${dy}px)`
    }
    function onMouseUp() {
      if (!dragRef.current.dragging) return
      dragRef.current.dragging = false
      if (ref?.current) ref.current.style.cursor = ''
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup',   onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup',   onMouseUp)
    }
  }, [ref])

  function onHeaderMouseDown(e) {
    e.preventDefault()
    dragRef.current.dragging = true
    dragRef.current.startX   = e.clientX - dragRef.current.dx
    dragRef.current.startY   = e.clientY - dragRef.current.dy
    if (ref?.current) ref.current.style.cursor = 'grabbing'
  }

  function downloadTsv() {
    if (!result.stats) return
    const s = result.stats
    const rows = [
      ['stat', 'value'],
      ['n',      s.n],
      ['mean',   s.mean],
      ['median', s.median],
      ['std',    s.std],
      ['min',    s.min],
      ['max',    s.max],
      ['q25',    s.q25],
      ['q75',    s.q75],
      ['q90',    s.q90],
      ['q95',    s.q95],
      ['q99',    s.q99],
    ]
    const tsv = rows.map(r => r.join('\t')).join('\n')
    Object.assign(document.createElement('a'), {
      href:     'data:text/tab-separated-values;charset=utf-8,' + encodeURIComponent(tsv),
      download: `pmar_stats_${Date.now()}.tsv`,
    }).click()
  }

  const rows = result.stats ? [
    [c.statsN,      result.stats.n.toLocaleString()],
    [c.statsMean,   fmt(result.stats.mean)],
    [c.statsMedian, fmt(result.stats.median)],
    [c.statsStd,    fmt(result.stats.std)],
    [c.statsMin,    fmt(result.stats.min)],
    [c.statsMax,    fmt(result.stats.max)],
    [c.statsQ25,    fmt(result.stats.q25)],
    [c.statsQ75,    fmt(result.stats.q75)],
    [c.statsQ90,    fmt(result.stats.q90)],
    [c.statsQ95,    fmt(result.stats.q95)],
    [c.statsQ99,    fmt(result.stats.q99)],
  ] : []

  return (
    <div ref={ref} className="pmar-stats-modal">
      <div className="pmar-stats-header" onMouseDown={onHeaderMouseDown}>
        <span className="pmar-stats-title">{c.statsTitle}</span>
        <button className="pmar-stats-close" onClick={onClose}>×</button>
      </div>

      {!result.stats ? (
        <p className="pmar-stats-nodata">{c.statsNoData}</p>
      ) : (
        <>
          <table className="pmar-stats-table">
            <tbody>
              {rows.map(([label, val]) => (
                <tr key={label}>
                  <td className="pmar-stats-label">{label}</td>
                  <td className="pmar-stats-value">{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="pmar-stats-download" onClick={downloadTsv}>
            ⬇ {c.statsDownload}
          </button>
        </>
      )}
    </div>
  )
})
