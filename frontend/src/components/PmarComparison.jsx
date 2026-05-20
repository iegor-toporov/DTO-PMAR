import { forwardRef, useLayoutEffect, useRef } from 'react'
import { useLang } from '../LanguageContext'
import './PmarComparison.css'

export const AREA_COLORS = ['#f46d43', '#4575b4', '#1a9850', '#9e66ab', '#d73027', '#fc8d59', '#74add1', '#a6d854']

// ── Multi-area grouped histogram SVG ─────────────────────────────────────────
// Each bin has N side-by-side sub-bars (one per area). The viewBox width grows
// with N so bars never get thinner than ~8 SVG units.

function ComparisonSVG({ results, mapTheme, svgRef }) {
  const nBins = results[0]?.nBins ?? 20
  const N     = results.length
  const H     = 200
  const mx    = { top: 14, right: 14, bottom: 38, left: 44 }
  // Minimum bar width = 8 SVG units; bins are N bars wide each
  const minPw = nBins * N * 8
  const W     = Math.max(420, mx.left + mx.right + minPw)
  const pw    = W - mx.left - mx.right
  const ph    = H - mx.top  - mx.bottom

  const globalLogMin = Math.min(...results.map(r => r.logMin))
  const globalLogMax = Math.max(...results.map(r => r.logMax))
  const logRange     = globalLogMax - globalLogMin

  const textColor = mapTheme === 'light' ? '#1e293b' : '#e2e8f0'
  const gridColor = mapTheme === 'light' ? '#cbd5e1' : '#334155'
  const bgColor   = mapTheme === 'light' ? '#f8fafc' : '#1e293b'

  const bars = []
  results.forEach((result, aIdx) => {
    const { bins, logMin, step } = result
    const maxBin = Math.max(...bins, 1)
    bins.forEach((count, bIdx) => {
      const binX = mx.left + (logMin + bIdx * step - globalLogMin) / logRange * pw
      const binW = step / logRange * pw
      const subW = binW / N
      const bh   = (count / maxBin) * ph
      if (bh <= 0) return
      bars.push(
        <rect key={`${aIdx}-${bIdx}`}
              x={binX + aIdx * subW + 0.5}
              y={mx.top + ph - bh}
              width={Math.max(0, subW - 1)}
              height={bh}
              fill={AREA_COLORS[aIdx % AREA_COLORS.length]}
              opacity="0.85" />
      )
    })
  })

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

      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = mx.top + ph * (1 - f)
        return <line key={f} x1={mx.left} x2={mx.left + pw} y1={y} y2={y}
                     stroke={f === 0 ? textColor : gridColor}
                     strokeWidth={f === 0 ? 1 : 0.5} />
      })}

      {bars}

      <line x1={mx.left} x2={mx.left} y1={mx.top} y2={mx.top + ph}
            stroke={textColor} strokeWidth={1} />

      {/* Y ticks */}
      {[0, 25, 50, 75, 100].map(pct => {
        const y = mx.top + ph * (1 - pct / 100)
        return (
          <g key={pct}>
            <line x1={mx.left - 4} x2={mx.left} y1={y} y2={y}
                  stroke={textColor} strokeWidth={1} />
            <text x={mx.left - 6} y={y + 3} textAnchor="end"
                  fontSize={9} fill={textColor}>{pct}%</text>
          </g>
        )
      })}

      {/* Y axis label */}
      <text x={10} y={mx.top + ph / 2} textAnchor="middle"
            fontSize={9} fill={textColor}
            transform={`rotate(-90 10 ${mx.top + ph / 2})`}>% of peak</text>

      {xTicks.map(({ x, label }) => (
        <g key={label}>
          <line x1={x} x2={x} y1={mx.top + ph} y2={mx.top + ph + 4}
                stroke={textColor} strokeWidth={1} />
          <text x={x} y={mx.top + ph + 14} textAnchor="middle"
                fontSize={9} fill={textColor}>{label}</text>
        </g>
      ))}

      <text x={mx.left + pw / 2} y={H - 3} textAnchor="middle"
            fontSize={9} fill={textColor}>value (log&#x2081;&#x2080;)</text>

      {results.map((_, i) => {
        const lx = W - mx.right - 24
        const ly = mx.top + 2 + i * 13
        return (
          <g key={i}>
            <rect x={lx} y={ly} width={10} height={10}
                  fill={AREA_COLORS[i % AREA_COLORS.length]} opacity="0.75" rx={2} />
            <text x={lx + 13} y={ly + 9} fontSize={9} fill={textColor}>
              {String.fromCharCode(65 + i)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export const PmarComparisonModal = forwardRef(function PmarComparisonModal(
  { results, mapTheme, onClose, onRemoveArea, stackIndex = 0 }, ref
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

  function downloadPng() {
    const svg = svgRef.current
    if (!svg || !results.length) return
    // Use viewBox dimensions so the PNG reflects the full chart width,
    // not the (possibly compressed) on-screen rendering width.
    const vb = svg.viewBox.baseVal
    const pw = vb.width, ph = vb.height
    const SCALE = 2

    // Legend layout (CSS px)
    const padH    = 12
    const padVTop = 10
    const padVBot = 8
    const rowH    = 18
    const rowGap  = 4
    const swatchS = 10
    const textX   = padH + swatchS + 7
    const legendH = padVTop + results.length * rowH + (results.length - 1) * rowGap + padVBot

    const isDark    = mapTheme !== 'light'
    const bg        = isDark ? '#1e293b' : '#f8fafc'
    const textColor = isDark ? '#e2e8f0' : '#1e293b'

    const canvas = document.createElement('canvas')
    canvas.width  = pw * SCALE
    canvas.height = (legendH + ph) * SCALE
    const ctx = canvas.getContext('2d')

    // Legend background
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, pw * SCALE, legendH * SCALE)

    // Legend rows
    ctx.textBaseline = 'middle'
    ctx.font = `${11 * SCALE}px system-ui, -apple-system, sans-serif`
    results.forEach((r, i) => {
      const rowTop   = padVTop + i * (rowH + rowGap)
      const swatchTop = rowTop + (rowH - swatchS) / 2
      ctx.fillStyle   = AREA_COLORS[i % AREA_COLORS.length]
      ctx.globalAlpha = 0.85
      ctx.fillRect(padH * SCALE, swatchTop * SCALE, swatchS * SCALE, swatchS * SCALE)
      ctx.globalAlpha = 1
      ctx.fillStyle = textColor
      ctx.fillText(
        `${String.fromCharCode(65 + i)} — ${r.total.toLocaleString()} cells · ${fmtArea(r)}`,
        textX * SCALE,
        (rowTop + rowH / 2) * SCALE,
      )
    })

    // Chart SVG below legend
    const clone = svg.cloneNode(true)
    clone.setAttribute('width',  pw)
    clone.setAttribute('height', ph)
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, legendH * SCALE, pw * SCALE, ph * SCALE)
      Object.assign(document.createElement('a'), {
        href:     canvas.toDataURL('image/png'),
        download: `pmar_comparison_${Date.now()}.png`,
      }).click()
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(clone.outerHTML)
  }

  function fmtArea(r) {
    const dLat   = r.snapLatMax - r.snapLatMin
    const dLon   = r.snapLonMax - r.snapLonMin
    const latMid = (r.snapLatMin + r.snapLatMax) / 2
    const km2    = Math.abs(dLat * dLon * 111.32 * 111.32 * Math.cos(latMid * Math.PI / 180))
    return km2 >= 10 ? `~${Math.round(km2)} km²` : `~${km2.toFixed(1)} km²`
  }

  const hasChart = results.length >= 2

  return (
    <div ref={ref} className="pmar-comparison-modal">
      <div className="pmar-comparison-header" onMouseDown={onHeaderMouseDown}>
        <span className="pmar-comparison-title">{c.comparisonTitle}</span>
        <button className="pmar-comparison-close" onClick={onClose}>×</button>
      </div>

      {results.length === 0 ? (
        <p className="pmar-comparison-nodata">{c.comparisonAddHint}</p>
      ) : (
        <div className="pmar-comparison-legend">
          {results.map((r, i) => (
            <div key={i} className="pmar-comparison-legend-row">
              <span className="pmar-comparison-swatch"
                    style={{ background: AREA_COLORS[i % AREA_COLORS.length] }} />
              <span className="pmar-comparison-area-label">
                {String.fromCharCode(65 + i)} — {r.total.toLocaleString()} cells · {fmtArea(r)}
              </span>
              <button className="pmar-comparison-remove" onClick={() => onRemoveArea(i)}>×</button>
            </div>
          ))}
        </div>
      )}

      {results.length === 1 && (
        <p className="pmar-comparison-nodata">{c.comparisonNeedMore}</p>
      )}

      {hasChart && (
        <>
          <ComparisonSVG results={results} mapTheme={mapTheme} svgRef={svgRef} />
          <button className="pmar-comparison-download" onClick={downloadPng}>
            ⬇ {c.comparisonDownload}
          </button>
        </>
      )}
    </div>
  )
})
