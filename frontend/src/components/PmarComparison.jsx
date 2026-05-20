import { forwardRef, useLayoutEffect, useRef } from 'react'
import { useLang } from '../LanguageContext'
import './PmarComparison.css'

// ── Overlapping histogram SVG ─────────────────────────────────────────────────

function ComparisonSVG({ resultA, resultB, mapTheme, svgRef }) {
  const W = 420, H = 200
  const mx = { top: 14, right: 14, bottom: 38, left: 44 }
  const pw  = W - mx.left - mx.right
  const ph  = H - mx.top  - mx.bottom

  const globalLogMin = Math.min(resultA.logMin, resultB.logMin)
  const globalLogMax = Math.max(resultA.logMax, resultB.logMax)
  const logRange     = globalLogMax - globalLogMin

  const textColor = mapTheme === 'light' ? '#1e293b' : '#e2e8f0'
  const gridColor = mapTheme === 'light' ? '#cbd5e1' : '#334155'
  const bgColor   = mapTheme === 'light' ? '#f8fafc' : '#1e293b'

  function barsForResult(result, fill) {
    const { bins, logMin, step } = result
    const maxBin = Math.max(...bins, 1)
    return bins.map((count, i) => {
      const barLogMin = logMin + i * step
      const x = mx.left + (barLogMin - globalLogMin) / logRange * pw
      const w = step / logRange * pw
      const bh = (count / maxBin) * ph
      return (
        <rect key={i}
              x={x + 0.5}
              y={mx.top + ph - bh}
              width={Math.max(0, w - 0.5)}
              height={bh}
              fill={fill}
              opacity="0.60" />
      )
    })
  }

  // X ticks at integer log10 values
  const xTicks = []
  for (let exp = Math.ceil(globalLogMin); exp <= Math.floor(globalLogMax); exp++) {
    const x   = mx.left + ((exp - globalLogMin) / logRange) * pw
    const val = Math.round(10 ** exp)
    const label = val >= 1e6 ? `${val / 1e6}M` : val >= 1e3 ? `${val / 1e3}k` : String(val)
    xTicks.push({ x, label })
  }

  return (
    <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`}
         xmlns="http://www.w3.org/2000/svg"
         style={{ display: 'block', background: bgColor, borderRadius: 4 }}>

      {/* grid */}
      {[0.25, 0.5, 0.75, 1].map(f => {
        const y = mx.top + ph * (1 - f)
        return <line key={f} x1={mx.left} x2={mx.left + pw} y1={y} y2={y}
                     stroke={gridColor} strokeWidth={0.5} />
      })}

      {/* area A bars */}
      {barsForResult(resultA, '#f46d43')}
      {/* area B bars */}
      {barsForResult(resultB, '#4575b4')}

      {/* axes */}
      <line x1={mx.left} x2={mx.left + pw} y1={mx.top + ph} y2={mx.top + ph}
            stroke={textColor} strokeWidth={1} />
      <line x1={mx.left} x2={mx.left} y1={mx.top} y2={mx.top + ph}
            stroke={textColor} strokeWidth={1} />

      {/* X ticks */}
      {xTicks.map(({ x, label }) => (
        <g key={label}>
          <line x1={x} x2={x} y1={mx.top + ph} y2={mx.top + ph + 4}
                stroke={textColor} strokeWidth={1} />
          <text x={x} y={mx.top + ph + 14} textAnchor="middle"
                fontSize={9} fill={textColor}>{label}</text>
        </g>
      ))}

      {/* axis label */}
      <text x={mx.left + pw / 2} y={H - 3} textAnchor="middle"
            fontSize={9} fill={textColor}>value (log&#x2081;&#x2080;)</text>

      {/* legend */}
      <rect x={W - mx.right - 60} y={mx.top + 2} width={10} height={10}
            fill="#f46d43" opacity="0.75" rx={2} />
      <text x={W - mx.right - 46} y={mx.top + 11} fontSize={9} fill={textColor}>A</text>
      <rect x={W - mx.right - 36} y={mx.top + 2} width={10} height={10}
            fill="#4575b4" opacity="0.75" rx={2} />
      <text x={W - mx.right - 22} y={mx.top + 11} fontSize={9} fill={textColor}>B</text>
    </svg>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export const PmarComparisonModal = forwardRef(function PmarComparisonModal(
  { resultA, resultB, mapTheme, onClose, stackIndex = 0 }, ref
) {
  const { t } = useLang()
  const c      = t.toolsPanel
  const svgRef = useRef(null)
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
    function onMouseMove(e) {
      if (!dragRef.current.dragging) return
      dragRef.current.dx = e.clientX - dragRef.current.startX
      dragRef.current.dy = e.clientY - dragRef.current.startY
      if (ref?.current)
        ref.current.style.transform =
          `translate(${dragRef.current.dx}px, ${dragRef.current.dy}px)`
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

  const hasData = resultA?.bins && resultB?.bins

  function downloadPng() {
    const svg = svgRef.current
    if (!svg) return
    const { width: svgW, height: svgH } = svg.getBoundingClientRect()
    const pw = Math.round(svgW), ph = Math.round(svgH)
    const canvas = document.createElement('canvas')
    canvas.width  = pw * 2
    canvas.height = ph * 2
    const clone = svg.cloneNode(true)
    clone.setAttribute('width',  pw)
    clone.setAttribute('height', ph)
    const img = new Image()
    img.onload = () => {
      canvas.getContext('2d').drawImage(img, 0, 0, pw * 2, ph * 2)
      Object.assign(document.createElement('a'), {
        href:     canvas.toDataURL('image/png'),
        download: `pmar_comparison_${Date.now()}.png`,
      }).click()
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(clone.outerHTML)
  }

  function fmtArea(result) {
    const dLat    = result.snapLatMax - result.snapLatMin
    const dLon    = result.snapLonMax - result.snapLonMin
    const latMid  = (result.snapLatMin + result.snapLatMax) / 2
    const km2     = Math.abs(dLat * dLon * 111.32 * 111.32 * Math.cos(latMid * Math.PI / 180))
    return km2 >= 10 ? `~${Math.round(km2)} km²` : `~${km2.toFixed(1)} km²`
  }

  return (
    <div ref={ref} className="pmar-comparison-modal">
      <div className="pmar-comparison-header" onMouseDown={onHeaderMouseDown}>
        <span className="pmar-comparison-title">{c.comparisonTitle}</span>
        <button className="pmar-comparison-close" onClick={onClose}>×</button>
      </div>

      {!hasData ? (
        <p className="pmar-comparison-nodata">{c.comparisonNoData}</p>
      ) : (
        <>
          <div className="pmar-comparison-legend">
            <span className="pmar-comparison-swatch" style={{ background: '#f46d43' }} />
            <span className="pmar-comparison-area-label">
              {c.comparisonAreaA} — {resultA.total.toLocaleString()} cells · {fmtArea(resultA)}
            </span>
            <span className="pmar-comparison-swatch" style={{ background: '#4575b4' }} />
            <span className="pmar-comparison-area-label">
              {c.comparisonAreaB} — {resultB.total.toLocaleString()} cells · {fmtArea(resultB)}
            </span>
          </div>
          <ComparisonSVG resultA={resultA} resultB={resultB} mapTheme={mapTheme} svgRef={svgRef} />
          <button className="pmar-comparison-download" onClick={downloadPng}>
            ⬇ {c.comparisonDownload}
          </button>
        </>
      )}
    </div>
  )
})
