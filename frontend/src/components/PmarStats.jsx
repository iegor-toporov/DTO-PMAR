import { forwardRef } from 'react'
import { Button, Text, Box } from '@mantine/core'
import { IconDownload } from '@tabler/icons-react'
import { useLang } from '../LanguageContext'
import { FloatingWindow } from './FloatingWindow'

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
  { result, onClose, stackIndex = 0 }, ref
) {
  const { t } = useLang()
  const c = t.toolsPanel

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
    <FloatingWindow ref={ref} title={c.statsTitle} onClose={onClose} stackIndex={stackIndex}>
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
              fullWidth size="xs" variant="light" color="blue" mt="xs"
              leftSection={<IconDownload size={12} />}
              onClick={downloadTsv}
            >
              {c.statsDownload}
            </Button>
          </>
        )}
      </Box>
    </FloatingWindow>
  )
})
