import { forwardRef, useEffect, useRef } from 'react'
import { Text, Box, Slider } from '@mantine/core'
import { useLang } from '../LanguageContext'
import { FloatingWindow } from './FloatingWindow'

// ── Value formatter ───────────────────────────────────────────────────────────

function fmt(v) {
  if (!isFinite(v) || v === 0) return '—'
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'k'
  if (v >= 10)  return v.toFixed(1)
  return v.toFixed(3)
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export const PmarThresholdModal = forwardRef(function PmarThresholdModal(
  { result, onClose, stackIndex = 0 }, ref
) {
  const { t } = useLang()
  const c = t.toolsPanel
  const threshRef = useRef(null)
  const cellsRef  = useRef(null)
  const areaRef   = useRef(null)
  const pctRef    = useRef(null)

  const { values = [], vmin, vmax, rasterRes } = result
  const logMin      = Math.log10(Math.max(vmin > 0 ? vmin : 1e-6, 1e-12))
  const logMax      = Math.log10(Math.max(vmax > 0 ? vmax : 1,    1e-12))
  const cellAreaKm2 = ((rasterRes ?? 0.1) * 111.32) ** 2

  function compute(sliderVal) {
    if (logMax <= logMin || !values.length)
      return { threshold: Math.pow(10, logMin), nAbove: 0, area: 0, pct: 0 }
    const threshold = Math.pow(10, logMin + (sliderVal / 1000) * (logMax - logMin))
    const nAbove    = values.filter(v => v >= threshold).length
    return { threshold, nAbove, area: nAbove * cellAreaKm2, pct: nAbove / values.length * 100 }
  }

  function updateDom(sliderVal) {
    const { threshold, nAbove, area, pct } = compute(sliderVal)
    if (threshRef.current) threshRef.current.textContent = fmt(threshold)
    if (cellsRef.current)  cellsRef.current.textContent  = nAbove.toLocaleString()
    if (areaRef.current)   areaRef.current.textContent   = area.toFixed(1)
    if (pctRef.current)    pctRef.current.textContent    = pct.toFixed(1)
  }

  useEffect(() => { updateDom(500) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <FloatingWindow ref={ref} title={c.thresholdTitle} onClose={onClose} stackIndex={stackIndex}>
      <Box px="sm" pt="xs" pb={6}>
        {values.length === 0 ? (
          <Text size="xs" c="dimmed" ta="center" py="md">{c.statsNoData}</Text>
        ) : (
          <>
            <Slider
              min={0} max={1000} defaultValue={500}
              color="blue" size="sm" mb="sm"
              onChange={val => updateDom(val)}
              label={null}
            />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  [c.thresholdAbove, threshRef, ''],
                  [c.thresholdCells, cellsRef,  ''],
                  [c.thresholdArea,  areaRef,   ' km²'],
                  [c.thresholdPct,   pctRef,    ' %'],
                ].map(([label, valueRef, unit]) => (
                  <tr key={label}>
                    <td style={{ padding: '2px 8px 2px 0', fontSize: 11, color: 'var(--text-secondary)' }}>{label}</td>
                    <td style={{ padding: '2px 0', fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', fontFamily: '"SF Mono", ui-monospace, monospace' }}>
                      <span ref={valueRef}>—</span>
                      <span style={{ opacity: 0.6 }}>{unit}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Box>
    </FloatingWindow>
  )
})
