import { useState, useRef, useEffect } from 'react'
import {
  Tabs, Button, Group, Stack, Text, TextInput, Textarea,
  SimpleGrid, SegmentedControl, NativeSelect, Paper, ScrollArea,
} from '@mantine/core'
import { useLang } from '../LanguageContext'

const PRESSURES = [
  { key: 'generic', labelKey: 'generic' },
  { key: 'plastic', labelKey: 'plastic' },
  { key: 'oil',     labelKey: 'oil'     },
  { key: 'larvae',  labelKey: 'larvae'  },
]

const USE_SOURCES = [
  { key: 'none'                   },
  { key: 'windfarms'              },
  { key: 'offshore_installations' },
  { key: 'geotiff'               },
]

const RESOLUTIONS = [
  { value: '0.001', label: '0.001°' },
  { value: '0.01',  label: '0.01°' },
  { value: '0.05',  label: '0.05°' },
  { value: '0.1',   label: '0.1°'  },
  { value: '0.2',   label: '0.2°'  },
  { value: '0.5',   label: '0.5°'  },
  { value: '1.0',   label: '1.0°'  },
]

const TIME_STEPS = [
  { value: '1',  label: '1 h'  },
  { value: '3',  label: '3 h'  },
  { value: '6',  label: '6 h'  },
  { value: '12', label: '12 h' },
  { value: '24', label: '24 h' },
]

const LABEL_STYLES = {
  label: {
    color: 'var(--mantine-color-dimmed)',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
}

function defaultStartDate() {
  const d = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatSeedShape(s) {
  if (!s) return null
  if (s.type === 'circle') {
    const km = (s.radius / 1000).toFixed(1)
    return `${s.lon.toFixed(3)}°E  ${s.lat.toFixed(3)}°N · r=${km} km`
  }
  return `${s.lon_min.toFixed(2)}°–${s.lon_max.toFixed(2)}°E · ${s.lat_min.toFixed(2)}°–${s.lat_max.toFixed(2)}°N`
}

function seedShapeToGeoJSON(shape) {
  if (!shape) return null
  if (shape.type === 'circle') {
    const { lon, lat, radius } = shape
    const N = 64
    const coords = []
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * 2 * Math.PI
      const dLat  = (radius / 111320) * Math.cos(angle)
      const dLon  = (radius / (111320 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle)
      coords.push([lon + dLon, lat + dLat])
    }
    coords.push(coords[0])
    return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }] }
  }
  const { lon_min, lat_min, lon_max, lat_max } = shape
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[lon_min,lat_min],[lon_max,lat_min],[lon_max,lat_max],[lon_min,lat_max],[lon_min,lat_min]]] }, properties: {} }],
  }
}

export default function PmarPanel({
  onRun, loading, status, statusType,
  drawMode, onStartDraw, onClearSeedShape, seedShape,
  useSource, onUseSourceChange,
  windfarmsLoading, windfarmsEmpty,
  offshoreLoading, offshoreEmpty,
}) {
  const { t, lang } = useLang()
  const p = t.pmar

  const [runMode, setRunMode] = useState('custom')

  const [seedAreaMode,      setSeedAreaMode]      = useState('draw')
  const [shapefileB64,      setShapefileB64]      = useState(null)
  const [shapefileName,     setShapefileName]     = useState('')
  const fileRef = useRef(null)

  const [t4mspAreas,        setT4mspAreas]        = useState([])
  const [selectedT4mspArea, setSelectedT4mspArea] = useState(null)
  const [t4mspSearch,       setT4mspSearch]       = useState('')

  const [customLabel,   setCustomLabel]   = useState('')
  const [customDesc,    setCustomDesc]    = useState('')
  const [seedAreaName,  setSeedAreaName]  = useState('')
  const [cmemsMargin,   setCmemsMargin]   = useState('5')
  const [pressure,      setPressure]      = useState('generic')
  const [startDate,     setStartDate]     = useState(defaultStartDate())
  const [durationDays,  setDurationDays]  = useState('30')
  const [pnum,          setPnum]          = useState('1000')
  const [timeStepHours, setTimeStepHours] = useState('1')

  const [res,         setRes]         = useState('0.1')
  const [margin,      setMargin]      = useState('1')
  const [geotiffB64,  setGeotiffB64]  = useState(null)
  const [geotiffName, setGeotiffName] = useState('')
  const [geotiffUrl,  setGeotiffUrl]  = useState('')
  const geotiffRef = useRef(null)

  const [scenarioStatuses, setScenarioStatuses] = useState({})
  const [scenarioId,       setScenarioId]       = useState('')

  const [customJob,             setCustomJob]             = useState(null)
  const [customPrecomputeError, setCustomPrecomputeError] = useState(null)
  const [refetchFlag,           setRefetchFlag]           = useState(0)

  useEffect(() => {
    fetch('/processes/scenario_status/execution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: {} }),
    })
      .then(r => r.json())
      .then(raw => {
        const data    = raw.result ?? raw
        const resp    = (data.scenarios !== undefined) ? data : { scenarios: data, t4msp_areas: [] }
        const s = {}
        for (const [id, info] of Object.entries(resp.scenarios)) {
          s[id] = { ...info, status: info.computed ? 'ready' : 'not_computed' }
        }
        setScenarioStatuses(s)
        setT4mspAreas(resp.t4msp_areas ?? [])
      })
      .catch(() => {})
  }, [runMode, refetchFlag])

  useEffect(() => {
    if (!customJob) return
    const iv = setInterval(async () => {
      try {
        const r   = await fetch(`/jobs/${customJob.jobId}`)
        const job = await r.json()
        if (job.status === 'successful') {
          try {
            const resR    = await fetch(`/jobs/${customJob.jobId}/results`)
            const results = await resR.json()
            const newSid  = results.scenario_id
            if (newSid) setScenarioId(newSid)
          } catch {}
          setCustomJob(null)
          setRefetchFlag(f => f + 1)
        } else if (job.status === 'failed') {
          setCustomJob(null)
          setCustomPrecomputeError(p.computeBusy)
          setRefetchFlag(f => f + 1)
        }
      } catch {}
    }, 5000)
    return () => clearInterval(iv)
  }, [customJob, p.computeBusy])

  async function handleCustomCompute() {
    setCustomPrecomputeError(null)
    const geojson = seedAreaMode === 'draw' ? seedShapeToGeoJSON(seedShape) : null

    const startIso = startDate + 'T00:00:00'
    const label    = customLabel.trim() || `${p.pressures[pressure]} — ${startDate}`
    const inputs   = {
      pressure,
      start_time:      startIso,
      duration_days:   parseInt(durationDays),
      pnum:            parseInt(pnum),
      time_step_hours: parseInt(timeStepHours),
      label,
      ...(geojson            ? { geojson: JSON.stringify(geojson) }  : {}),
      ...(shapefileB64       ? { shapefile_b64: shapefileB64 }       : {}),
      ...(selectedT4mspArea  ? { t4msp_area_id: selectedT4mspArea }  : {}),
      ...(seedAreaMode === 'draw' && seedAreaName.trim()
            ? { area_name: seedAreaName.trim() } : {}),
      cmems_margin: parseFloat(cmemsMargin) || 5.0,
      ...(customDesc.trim() ? { description: customDesc.trim() } : {}),
    }
    try {
      const r    = await fetch('/processes/precompute/execution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'respond-async' },
        body: JSON.stringify({ inputs }),
      })
      const data = await r.json()
      setCustomJob({ jobId: data.jobID })
    } catch {
      setCustomPrecomputeError('Errore avvio pre-calcolo.')
    }
  }

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setShapefileB64(ev.target.result.split(',')[1])
      setShapefileName(file.name)
    }
    reader.readAsDataURL(file)
  }

  function handleGeotiffChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setGeotiffB64(ev.target.result.split(',')[1])
      setGeotiffName(file.name)
    }
    reader.readAsDataURL(file)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (runMode !== 'scenario') return
    const gUrl = geotiffUrl.trim() || null
    onRun({
      scenario_id: scenarioId,
      res: parseFloat(res),
      margin: parseFloat(margin) || 0,
      geotiff_b64: useSource === 'geotiff' ? geotiffB64 : null,
      geotiff_url: useSource === 'geotiff' ? gUrl        : null,
    })
  }

  const seedInfo = seedAreaMode === 'draw' ? formatSeedShape(seedShape) : null

  const canPrecompute = !customJob && !loading && (
    (seedAreaMode === 'draw'   && !!seedShape) ||
    (seedAreaMode === 'upload' && !!shapefileB64) ||
    (seedAreaMode === 't4msp'  && !!selectedT4mspArea)
  )

  const canSubmit = !loading && runMode === 'scenario' &&
    !!scenarioId && scenarioStatuses[scenarioId]?.status === 'ready' &&
    (useSource !== 'geotiff' || !!geotiffB64 || !!geotiffUrl.trim())

  const ncBytesPerStep  = pressure === 'oil' ? 160 : pressure === 'larvae' ? 120 : pressure === 'plastic' ? 60 : 40
  const stepsPerDay     = 24 / parseInt(timeStepHours || 1)
  const ncEstimateBytes = parseInt(pnum || 0) * parseInt(durationDays || 0) * stepsPerDay * ncBytesPerStep
  function formatNcSize(bytes) {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + ' MB'
    return (bytes / 1e3).toFixed(0) + ' KB'
  }
  const ncColor  = ncEstimateBytes > 2e9 ? 'red.4' : ncEstimateBytes > 5e8 ? 'yellow.4' : 'dimmed'
  const ncBg     = ncEstimateBytes > 2e9 ? 'rgba(239,68,68,0.07)' : ncEstimateBytes > 5e8 ? 'rgba(245,158,11,0.07)' : 'rgba(10,132,255,0.05)'
  const ncBorder = ncEstimateBytes > 2e9 ? '#ef4444' : ncEstimateBytes > 5e8 ? '#f59e0b' : 'rgba(10,132,255,0.30)'

  const customEntries = Object.entries(scenarioStatuses).filter(([, sc]) => sc.source === 'custom')

  const searchLow     = t4mspSearch.toLowerCase()
  const filteredAreas = searchLow
    ? t4mspAreas.filter(a => a.label.toLowerCase().includes(searchLow))
    : t4mspAreas

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="sm" p="md">

        <Tabs value={runMode} onChange={setRunMode}>
          <Tabs.List grow>
            <Tabs.Tab value="custom" fz="xs">{p.modeCustomBtn}</Tabs.Tab>
            <Tabs.Tab value="scenario" fz="xs">{p.modeScenarioBtn}</Tabs.Tab>
          </Tabs.List>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* ── TAB SIMULAZIONE ─────────────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════ */}
          <Tabs.Panel value="custom">
            <Stack gap="sm" pt="sm">

              {/* ── Simulazioni esistenti ────────────────────────── */}
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                {p.sectionExisting}
              </Text>
              {customEntries.length === 0 ? (
                <Text size="xs" c="dimmed" ta="center">{p.noExisting}</Text>
              ) : (
                <>
                  <NativeSelect
                    size="xs"
                    value={scenarioId}
                    onChange={e => setScenarioId(e.target.value)}
                    data={[
                      { value: '', label: p.scenarioNone },
                      ...customEntries.map(([sid, sc]) => {
                        const label = lang === 'it' ? sc.label_it : sc.label_en
                        const icon  = sc.status === 'ready' ? '✓' : sc.status === 'not_computed' ? '○' : '✗'
                        return { value: sid, label: `${icon} ${label}` }
                      })
                    ]}
                  />
                  {(() => {
                    const sc = scenarioId ? scenarioStatuses[scenarioId] : null
                    if (sc) {
                      const areaName = lang === 'it'
                        ? (sc.area_it || p.areaUndefined)
                        : (sc.area_en || p.areaUndefined)
                      const isCustomArea = areaName === 'Area personalizzata' || areaName === 'Custom area'
                      return (
                        <Paper p="xs" radius="sm" style={{ background: 'var(--modal-bg)', border: '1px solid var(--modal-divider)' }}>
                          <Stack gap={4}>
                            {[
                              [p.seedAreaName,        isCustomArea ? p.areaUndefined : areaName],
                              [p.sectionPressure,     p.pressures[sc.pressure]],
                              [p.labelStart,          sc.start_time],
                              [p.labelDuration,       `${sc.duration_days} d`],
                              [p.labelParticles,      sc.pnum?.toLocaleString()],
                              [p.labelTimeStep,       `${sc.time_step_hours} h`],
                              [p.labelCmemsMarginShort, `${sc.cmems_margin ?? 5} °`],
                            ].map(([label, val]) => (
                              <Group key={label} justify="space-between" gap="xs">
                                <Text size="10px" c="dimmed">{label}</Text>
                                <Text size="10px" c="gray.3" fw={500}>{val}</Text>
                              </Group>
                            ))}
                            {sc.description && (
                              <Text size="10px" c="dimmed" mt={4} style={{ borderTop: '1px solid var(--modal-divider)', paddingTop: 4, lineHeight: 1.5 }}>
                                {sc.description}
                              </Text>
                            )}
                          </Stack>
                        </Paper>
                      )
                    }
                    return <Text size="xs" c="dimmed" ta="center">{p.sectionExistingDesc}</Text>
                  })()}
                </>
              )}

              {/* ── Nuova simulazione ──────────────────────────── */}
              <Text size="xs" fw={700} c="blue.4" tt="uppercase" style={{ letterSpacing: '0.05em', borderTop: '1px solid var(--modal-divider)', paddingTop: 8 }}>
                {p.sectionNewScenario}
              </Text>

              <TextInput
                size="xs"
                label={p.labelTitle}
                placeholder={p.labelTitleHint}
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
                styles={LABEL_STYLES}
              />

              <Textarea
                size="xs"
                label={p.labelDesc}
                placeholder={p.labelDescHint}
                value={customDesc}
                onChange={e => setCustomDesc(e.target.value)}
                autosize
                minRows={2}
                styles={LABEL_STYLES}
              />

              {/* ── Area di seeding ───────────────────────────── */}
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                {p.seedAreaLabel}
              </Text>
              <SegmentedControl
                size="xs"
                fullWidth
                value={seedAreaMode}
                onChange={mode => {
                  setSeedAreaMode(mode)
                  if (mode !== 'draw') onClearSeedShape()
                }}
                data={[
                  { value: 'draw',   label: p.seedAreaDraw },
                  { value: 'upload', label: p.seedAreaUpload },
                  { value: 't4msp',  label: p.seedAreaT4msp },
                ]}
                color="blue"
              />

              {seedAreaMode === 'draw' && (
                <Stack gap="xs">
                  <Group grow gap="xs">
                    <Button
                      size="xs"
                      variant={drawMode === 'circle' ? 'filled' : 'light'}
                      color="blue"
                      onClick={() => onStartDraw('circle')}
                    >
                      {p.btnCircle}
                    </Button>
                    <Button
                      size="xs"
                      variant={drawMode === 'rectangle' ? 'filled' : 'light'}
                      color="blue"
                      onClick={() => onStartDraw('rectangle')}
                    >
                      {p.btnRect}
                    </Button>
                  </Group>
                  {drawMode === 'circle'    && <Text size="xs" c="dimmed" ta="center">{p.hintCircle}</Text>}
                  {drawMode === 'rectangle' && <Text size="xs" c="dimmed" ta="center">{p.hintRect}</Text>}
                  {!drawMode && seedInfo && (
                    <Text size="xs" ta="center" c="blue.4" p="xs" style={{ background: 'rgba(10,132,255,0.08)', borderRadius: 6, border: '1px solid rgba(10,132,255,0.20)' }}>
                      {seedInfo}
                    </Text>
                  )}
                  {!drawMode && !seedShape && <Text size="xs" c="dimmed" ta="center">{p.hintNoShape}</Text>}
                  <TextInput
                    size="xs"
                    label={p.labelSeedName}
                    placeholder={p.labelSeedNameHint}
                    value={seedAreaName}
                    onChange={e => setSeedAreaName(e.target.value)}
                    styles={LABEL_STYLES}
                  />
                </Stack>
              )}

              {seedAreaMode === 'upload' && (
                <Button
                  size="xs"
                  variant="light"
                  color="blue"
                  fullWidth
                  onClick={() => fileRef.current?.click()}
                  style={{ height: 'auto', padding: '12px 8px' }}
                >
                  <input ref={fileRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={handleFileChange} />
                  {shapefileB64
                    ? <Text size="xs">{shapefileName}</Text>
                    : <Text size="xs" c="dimmed">{p.uploadHint}</Text>}
                </Button>
              )}

              {seedAreaMode === 't4msp' && (
                <Stack gap="xs">
                  <TextInput
                    size="xs"
                    placeholder={p.t4mspSearchHint}
                    value={t4mspSearch}
                    onChange={e => { setT4mspSearch(e.target.value); setSelectedT4mspArea(null) }}
                  />
                  <ScrollArea h={140} style={{ border: '1px solid var(--modal-border)', borderRadius: 6 }}>
                    <Stack gap={0}>
                      {filteredAreas.map(area => (
                        <button
                          key={area.id}
                          type="button"
                          onClick={() => setSelectedT4mspArea(selectedT4mspArea === area.id ? null : area.id)}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 10px',
                            border: 'none',
                            borderBottom: '1px solid var(--modal-divider)',
                            background: selectedT4mspArea === area.id ? 'rgba(10,132,255,0.14)' : 'transparent',
                            color: selectedT4mspArea === area.id ? '#64d2ff' : 'var(--text-secondary)',
                            fontSize: 12,
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                          }}
                        >
                          <span>{area.label}</span>
                          {selectedT4mspArea === area.id && <span style={{ fontSize: 10 }}>✓</span>}
                        </button>
                      ))}
                      {filteredAreas.length === 0 && (
                        <Text size="xs" c="dimmed" ta="center" p="sm">···</Text>
                      )}
                    </Stack>
                  </ScrollArea>
                </Stack>
              )}

              {/* ── Tipo di pressione ─────────────────────────── */}
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                {p.sectionPressure}
              </Text>
              <SimpleGrid cols={2} spacing="xs">
                {PRESSURES.map(pr => (
                  <Button
                    key={pr.key}
                    size="xs"
                    variant={pressure === pr.key ? 'filled' : 'light'}
                    color="blue"
                    onClick={() => setPressure(pr.key)}
                  >
                    {p.pressures[pr.key]}
                  </Button>
                ))}
              </SimpleGrid>

              {/* ── Parametri ──────────────────────────────────── */}
              <TextInput
                type="date"
                size="xs"
                label={p.labelStart}
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                styles={LABEL_STYLES}
              />
              <Group grow gap="xs">
                <TextInput
                  type="number"
                  size="xs"
                  label={p.labelDuration}
                  value={durationDays}
                  min="1"
                  max="730"
                  onChange={e => setDurationDays(e.target.value)}
                  styles={LABEL_STYLES}
                />
                <TextInput
                  type="number"
                  size="xs"
                  label={p.labelParticles}
                  value={pnum}
                  min="10"
                  max="100000"
                  onChange={e => setPnum(e.target.value)}
                  styles={LABEL_STYLES}
                />
              </Group>
              <NativeSelect
                size="xs"
                label={p.labelTimeStep}
                value={timeStepHours}
                onChange={e => setTimeStepHours(e.target.value)}
                data={TIME_STEPS}
                styles={LABEL_STYLES}
              />
              <TextInput
                type="number"
                size="xs"
                label={p.labelCmemsMargin}
                value={cmemsMargin}
                min="0"
                max="20"
                step="any"
                onChange={e => setCmemsMargin(e.target.value)}
                styles={LABEL_STYLES}
              />

              <Text
                size="10px"
                c={ncColor}
                p="xs"
                style={{ background: ncBg, borderRadius: 6, borderLeft: `2px solid ${ncBorder}`, lineHeight: 1.4 }}
              >
                {p.ncSizeHint.replace('{size}', formatNcSize(ncEstimateBytes))}
              </Text>

              <Button
                size="sm"
                color="blue"
                fullWidth
                disabled={!canPrecompute}
                onClick={handleCustomCompute}
                type="button"
              >
                {customJob ? p.btnPrecomputing : p.btnPrecompute}
              </Button>

              {customPrecomputeError && (
                <Text size="xs" c="red.4" ta="center">{customPrecomputeError}</Text>
              )}
            </Stack>
          </Tabs.Panel>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* ── TAB ANALISI ─────────────────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════ */}
          <Tabs.Panel value="scenario">
            <Stack gap="sm" pt="sm">

              {/* ── Info simulazione selezionata ─────────────── */}
              {(() => {
                const sc = scenarioStatuses[scenarioId]
                if (!sc || sc.status !== 'ready') {
                  return <Text size="xs" c="dimmed" ta="center">{p.hintNoScenario}</Text>
                }
                const areaName = lang === 'it'
                  ? (sc.area_it || p.areaUndefined)
                  : (sc.area_en || p.areaUndefined)
                const isCustomArea = areaName === 'Area personalizzata' || areaName === 'Custom area'
                return (
                  <Paper p="xs" radius="sm" style={{ background: 'var(--modal-bg)', border: '1px solid var(--modal-divider)' }}>
                    <Stack gap={4}>
                      {[
                        [p.seedAreaName,    isCustomArea ? p.areaUndefined : areaName],
                        [p.sectionPressure, p.pressures[sc.pressure]],
                        [p.labelStart,      sc.start_time],
                        [p.labelDuration,   `${sc.duration_days} d`],
                        [p.labelParticles,  sc.pnum?.toLocaleString()],
                        [p.labelTimeStep,   `${sc.time_step_hours} h`],
                      ].map(([label, val]) => (
                        <Group key={label} justify="space-between" gap="xs">
                          <Text size="10px" c="dimmed">{label}</Text>
                          <Text size="10px" c="gray.3" fw={500}>{val}</Text>
                        </Group>
                      ))}
                      {sc.description && (
                        <Text size="10px" c="dimmed" mt={4} style={{ borderTop: '1px solid var(--modal-divider)', paddingTop: 4, lineHeight: 1.5 }}>
                          {sc.description}
                        </Text>
                      )}
                    </Stack>
                  </Paper>
                )
              })()}

              {/* ── Layer sorgente ────────────────────────────── */}
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                {p.sectionUse}
              </Text>
              <SimpleGrid cols={2} spacing="xs">
                {USE_SOURCES.map(u => (
                  <Button
                    key={u.key}
                    size="xs"
                    variant={useSource === u.key ? 'filled' : 'light'}
                    color="blue"
                    onClick={() => onUseSourceChange(u.key)}
                  >
                    {u.key === 'windfarms' && windfarmsLoading ? '...'
                      : u.key === 'offshore_installations' && offshoreLoading ? '...'
                      : p.useSources[u.key]}
                  </Button>
                ))}
              </SimpleGrid>

              {useSource === 'windfarms' && !windfarmsEmpty && (
                <Text size="xs" c="blue.4" p="xs" style={{ background: 'rgba(10,132,255,0.07)', borderRadius: 6, borderLeft: '2px solid rgba(10,132,255,0.45)' }}>
                  {p.useWindfarmsInfo}
                </Text>
              )}
              {useSource === 'windfarms' && windfarmsEmpty && (
                <Text size="xs" c="red.4" p="xs" style={{ background: 'rgba(239,68,68,0.07)', borderRadius: 6, borderLeft: '2px solid rgba(239,68,68,0.4)' }}>
                  {p.useWindfarmsEmpty}
                </Text>
              )}
              {useSource === 'offshore_installations' && !offshoreEmpty && (
                <Text size="xs" c="blue.4" p="xs" style={{ background: 'rgba(10,132,255,0.07)', borderRadius: 6, borderLeft: '2px solid rgba(10,132,255,0.45)' }}>
                  {p.useOffshoreInfo}
                </Text>
              )}
              {useSource === 'offshore_installations' && offshoreEmpty && (
                <Text size="xs" c="red.4" p="xs" style={{ background: 'rgba(239,68,68,0.07)', borderRadius: 6, borderLeft: '2px solid rgba(239,68,68,0.4)' }}>
                  {p.useOffshoreEmpty}
                </Text>
              )}

              {useSource === 'geotiff' && (
                <Stack gap="xs">
                  <Button
                    size="xs"
                    variant="light"
                    color="blue"
                    fullWidth
                    onClick={() => geotiffRef.current?.click()}
                    style={{ height: 'auto', padding: '12px 8px' }}
                    type="button"
                  >
                    <input ref={geotiffRef} type="file" accept=".tif,.tiff" style={{ display: 'none' }} onChange={handleGeotiffChange} />
                    {geotiffB64
                      ? <Text size="xs">{geotiffName}</Text>
                      : <Text size="xs" c="dimmed">{p.geotiffUploadHint}</Text>}
                  </Button>
                  <Text size="xs" c="dimmed" ta="center">{p.geotiffOrLabel}</Text>
                  <TextInput
                    type="url"
                    size="xs"
                    placeholder={p.geotiffUrlHint}
                    value={geotiffUrl}
                    onChange={e => setGeotiffUrl(e.target.value)}
                  />
                </Stack>
              )}

              {/* ── Risoluzione + Margine ─────────────────────── */}
              <NativeSelect
                size="xs"
                label={p.labelRes}
                value={res}
                onChange={e => setRes(e.target.value)}
                data={RESOLUTIONS}
                styles={LABEL_STYLES}
              />
              <TextInput
                type="number"
                size="xs"
                label={p.labelMargin}
                value={margin}
                min="0"
                max="20"
                step="any"
                onChange={e => setMargin(e.target.value)}
                styles={LABEL_STYLES}
              />

              <Button size="sm" color="blue" fullWidth type="submit" disabled={!canSubmit}>
                {loading ? p.btnRunning : p.btnRun}
              </Button>

              {status && (
                <Text size="xs" ta="center" c={statusType === 'error' ? 'red.4' : statusType === 'ok' ? 'green.4' : 'dimmed'}>
                  {status}
                </Text>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </form>
  )
}
