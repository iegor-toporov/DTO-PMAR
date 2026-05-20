import { forwardRef, useLayoutEffect, useRef } from 'react'
import { Paper, Group, ActionIcon, Button, Text, Box } from '@mantine/core'
import { IconX, IconDownload } from '@tabler/icons-react'
import { useLang } from '../LanguageContext'

const MODAL_BG     = 'var(--modal-bg)'
const MODAL_BORDER = '1px solid var(--modal-border)'

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
          {c.statsTitle}
        </Text>
        <ActionIcon size="xs" variant="subtle" c="dimmed" onClick={onClose}>
          <IconX size={13} />
        </ActionIcon>
      </Group>

      <Box px="sm" pt="xs" pb={6}>
        {!result.stats ? (
          <Text size="xs" c="dimmed" ta="center" py="md">{c.statsNoData}</Text>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {rows.map(([label, val]) => (
                  <tr key={label}>
                    <td style={{ padding: '2px 8px 2px 0', fontSize: 11, color: 'var(--text-secondary)' }}>{label}</td>
                    <td style={{ padding: '2px 0', fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', fontFamily: '"SF Mono", ui-monospace, monospace' }}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              fullWidth
              size="xs"
              variant="light"
              color="blue"
              mt="xs"
              leftSection={<IconDownload size={12} />}
              onClick={downloadTsv}
            >
              {c.statsDownload}
            </Button>
          </>
        )}
      </Box>
    </Paper>
  )
})
