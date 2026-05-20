import { forwardRef, useLayoutEffect, useRef } from 'react'
import { useLang } from '../LanguageContext'
import './PmarProfile.css'

// ── Profile sampling ──────────────────────────────────────────────────────────

export function sampleProfile(latA, lonA, latB, lonB, rd, nSamples = 300) {
  const { raster_values, raster_lon_min, raster_lat_min, raster_res, raster_nx, raster_ny } = rd
  const cosLat = Math.cos(latA * Math.PI / 180)
  const pts    = []

  for (let i = 0; i <= nSamples; i++) {
    const t   = i / nSamples
    const lat = latA + t * (latB - latA)
    const lon = lonA + t * (lonB - lonA)
    const col = Math.round((lon - raster_lon_min) / raster_res)
    const row = Math.round((lat - raster_lat_min) / raster_res)
    if (col < 0 || col >= raster_nx || row < 0 || row >= raster_ny) continue
    const v    = raster_values[row]?.[col] ?? 0
    const dist = Math.hypot((lat - latA) * 111.32, (lon - lonA) * 111.32 * cosLat)
    pts.push({ dist, value: v })
  }

  return { pts, totalDist: pts.at(-1)?.dist ?? 0, latA, lonA, latB, lonB }
}

// ── SVG line chart ────────────────────────────────────────────────────────────

function ProfileSVG({ result, mapTheme, svgRef }) {
  const { pts, totalDist } = result
  const W = 380, H = 190
  const mx = { top: 14, right: 14, bottom: 36, left: 44 }
  const pw  = W - mx.left - mx.right
  const ph  = H - mx.top  - mx.bottom

  const textColor = mapTheme === 'light' ? '#1e293b' : '#e2e8f0'
  const gridColor = mapTheme === 'light' ? '#cbd5e1' : '#334155'
  const bgColor   = mapTheme === 'light' ? '#f8fafc' : '#1e293b'

  const posValues = pts.map(p => p.value).filter(v => v > 0 && isFinite(v))
  const logMin = posValues.length ? Math.log10(Math.min(...posValues)) : 0
  const logMax = posValues.length ? Math.log10(Math.max(...posValues)) : 1
  const logRange = logMax - logMin || 1

  // Build SVG path with gaps at zero values
  let d = '', penDown = false
  for (const { dist, value } of pts) {
    if (value <= 0 || !isFinite(value)) { penDown = false; continue }
    const x = mx.left + (dist / Math.max(totalDist, 1e-9)) * pw
    const t = Math.max(0, Math.min(1, (Math.log10(value) - logMin) / logRange))
    const y = mx.top + ph - t * ph
    d += penDown
      ? ` L ${x.toFixed(1)} ${y.toFixed(1)}`
      : ` M ${x.toFixed(1)} ${y.toFixed(1)}`
    penDown = true
  }

  // Y ticks at integer log10 values
  const yTicks = []
  for (let exp = Math.ceil(logMin); exp <= Math.floor(logMax); exp++) {
    const y     = mx.top + ph - ((exp - logMin) / logRange) * ph
    const val   = Math.round(10 ** exp)
    const label = val >= 1e6 ? `${val / 1e6}M` : val >= 1e3 ? `${val / 1e3}k` : String(val)
    yTicks.push({ y, label })
  }

  // X ticks: 0, mid, end
  const xTicks = [0, 0.5, 1].map(f => ({
    x:     mx.left + f * pw,
    label: (f * totalDist).toFixed(1),
  }))

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

      {/* profile line */}
      {d && <path d={d} stroke="#f97316" strokeWidth={2} fill="none" />}

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

      {/* Y ticks */}
      {yTicks.map(({ y, label }) => (
        <g key={label}>
          <line x1={mx.left - 4} x2={mx.left} y1={y} y2={y}
                stroke={textColor} strokeWidth={1} />
          <text x={mx.left - 7} y={y + 3} textAnchor="end"
                fontSize={9} fill={textColor}>{label}</text>
        </g>
      ))}

      {/* axis labels */}
      <text x={mx.left + pw / 2} y={H - 3} textAnchor="middle"
            fontSize={9} fill={textColor}>dist. (km)</text>
      <text x={10} y={mx.top + ph / 2} textAnchor="middle"
            fontSize={9} fill={textColor}
            transform={`rotate(-90 10 ${mx.top + ph / 2})`}>value (log₁₀)</text>
    </svg>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export const PmarProfileModal = forwardRef(function PmarProfileModal(
  { result, mapTheme, onClose, stackIndex = 0 }, ref
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

  const hasData = result.pts?.some(p => p.value > 0)

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
        download: `pmar_profile_${Date.now()}.png`,
      }).click()
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(clone.outerHTML)
  }

  return (
    <div ref={ref} className="pmar-profile-modal">
      <div className="pmar-profile-header" onMouseDown={onHeaderMouseDown}>
        <span className="pmar-profile-title">{c.profileTitle}</span>
        <button className="pmar-profile-close" onClick={onClose}>×</button>
      </div>

      {!hasData ? (
        <p className="pmar-profile-nodata">{c.profileNoData}</p>
      ) : (
        <>
          <ProfileSVG result={result} mapTheme={mapTheme} svgRef={svgRef} />
          <button className="pmar-profile-download" onClick={downloadPng}>
            ⬇ {c.profileDownload}
          </button>
        </>
      )}
    </div>
  )
})
