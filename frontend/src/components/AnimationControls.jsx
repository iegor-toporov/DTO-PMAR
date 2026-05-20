import { Paper, Group, ActionIcon, Slider, Badge, Text, Tooltip } from '@mantine/core'
import { IconPlayerPlay, IconPlayerPause, IconCircle } from '@tabler/icons-react'
import { MODEL_STYLES } from '../constants'
import { useLang } from '../LanguageContext'

export default function AnimationControls({
  simData,
  currentStep,
  isPlaying,
  onTogglePlay,
  onSliderChange,
  speed,
  onSpeedChange,
  showSeedShape,
  onToggleSeedShape,
}) {
  const { t } = useLang()
  if (!simData) return null

  const nSteps = simData.times.length
  const style  = MODEL_STYLES[simData.model] ?? MODEL_STYLES.OceanDrift
  const locale = t.controls.locale

  const d    = new Date(simData.times[currentStep])
  const date = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const label = `${date} ${time}  (${currentStep + 1}/${nSteps})`

  return (
    <Paper
      shadow="xl"
      radius="lg"
      style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        background: 'var(--panel-bg)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid var(--panel-border)',
        minWidth: 560,
        boxShadow: '0 4px 24px rgba(0,0,0,0.16)',
      }}
      px="lg"
      py="sm"
    >
      <Group gap="md" align="center" wrap="nowrap">
        <ActionIcon
          size={38}
          radius="xl"
          variant="filled"
          color="blue"
          onClick={onTogglePlay}
          style={{ flexShrink: 0 }}
        >
          {isPlaying
            ? <IconPlayerPause size={16} />
            : <IconPlayerPlay size={16} />}
        </ActionIcon>

        <Slider
          value={currentStep}
          min={0}
          max={nSteps - 1}
          onChange={onSliderChange}
          color="blue"
          size="sm"
          style={{ flex: 1 }}
          label={null}
        />

        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', flexShrink: 0, minWidth: 160, textAlign: 'right' }}>
          {label}
        </Text>

        <Badge
          style={{ background: style.badge, color: style.color, flexShrink: 0, fontWeight: 600 }}
          radius="xl"
          size="sm"
        >
          {t.modelLabels[simData.model] ?? style.label}
        </Badge>

        <Group gap={6} align="center" wrap="nowrap" style={{ flexShrink: 0 }}>
          <Text size="11px" c="dimmed">{t.controls.speed}</Text>
          <Slider
            value={speed}
            min={1}
            max={20}
            onChange={onSpeedChange}
            color="blue"
            size="xs"
            style={{ width: 60 }}
            label={null}
          />
        </Group>

        <Tooltip label={showSeedShape ? t.controls.hideSeed : t.controls.showSeed} withArrow>
          <ActionIcon
            size="sm"
            variant={showSeedShape ? 'filled' : 'subtle'}
            color="blue"
            onClick={onToggleSeedShape}
            style={{ flexShrink: 0 }}
          >
            <IconCircle size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Paper>
  )
}
