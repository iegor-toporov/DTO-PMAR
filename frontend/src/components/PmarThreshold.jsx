import { forwardRef, useLayoutEffect, useRef } from 'react'
import { Paper, Group, ActionIcon, Text, Box, Slider } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { useLang } from '../LanguageContext'

const MODAL_BG     = 'var(--modal-bg)'
const MODAL_BORDER = '1px solid var(--modal-border)'

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
  { result, mapTheme, onClose, stackIndex = 0 }, ref
) {
  const { t } = useLang()
  const c = t.toolsPanel
  const dragRef   = useRef({ dragging: false, startX: 0, startY: 0, dx: 0, dy: 0 })
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

  useLayoutEffect(() => {
    const el = ref?.current
    if (!el) return
    const { width: elW, height: elH } = el.getBoundingClientRect()
    const { innerWidth: vw, innerHeight: vh } = window
    el.style.top    = `${vh - 68 - stackIndex * 24 - elH}px`
    el.style.left   = `${vw - 16 - stackIndex * 16 - elW}px`
    el.style.bottom = 'auto'
    el.style.right  = 'auto'
    updateDom(500)
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

  return (
    <Paper
      ref={ref}
      shadow="xl"
      radius="md"
      p={0}
      style={{
        position: 'fixed',
        zIndex: 1000,
        minWidth: 220,
        minHeight: 160,
        resize: 'both',
        overflow: 'hidden',
        background: MODAL_BG,
        border: MODAL_BORDER,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      }}
    >
      <Group
        justify="space-between"
        align="center"
        px="sm"
        py={6}
        style={{ borderBottom: '1px solid var(--modal-divider)', cursor: 'grab', userSelect: 'none' }}
        onMouseDown={onHeaderMouseDown}
      >
        <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.06em' }}>
          {c.thresholdTitle}
        </Text>
        <ActionIcon size="xs" variant="subtle" c="dimmed" onClick={onClose}>
          <IconX size={13} />
        </ActionIcon>
      </Group>

      <Box px="sm" pt="xs" pb={6}>
        {values.length === 0 ? (
          <Text size="xs" c="dimmed" ta="center" py="md">{c.statsNoData}</Text>
        ) : (
          <>
            <Slider
              min={0}
              max={1000}
              defaultValue={500}
              color="blue"
              size="sm"
              mb="sm"
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
    </Paper>
  )
})
