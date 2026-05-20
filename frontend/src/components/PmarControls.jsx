import { Paper, Group, SegmentedControl, ActionIcon, Tooltip, Text, Divider } from '@mantine/core'
import { IconEye, IconEyeOff, IconDownload, IconCircle, IconWind, IconDroplet } from '@tabler/icons-react'
import { useLang } from '../LanguageContext'

const INDICATORS = [
  { key: 'density', labelKey: 'indicatorDensity' },
  { key: 'sum',     labelKey: 'indicatorSum' },
  { key: 'max',     labelKey: 'indicatorMax' },
  { key: 'q90',     labelKey: 'indicatorQ90' },
]

export default function PmarControls({
  showPmarRaster,
  onTogglePmarRaster,
  showSeedShape,
  onToggleSeedShape,
  showWindFarms,
  onToggleWindFarms,
  hasWindFarms,
  showOffshoreInstallations,
  onToggleOffshoreInstallations,
  hasOffshoreInstallations,
  onDownloadPmar,
  elevated,
  activeIndicator,
  onIndicatorChange,
  hasIndicators,
}) {
  const { t } = useLang()
  const c = t.pmarControls

  return (
    <Paper
      shadow="xl"
      radius="lg"
      style={{
        position: 'absolute',
        bottom: elevated ? 90 : 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        background: 'var(--panel-bg)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid var(--panel-border)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.16)',
        transition: 'bottom 0.2s',
      }}
      px="md"
      py="xs"
    >
      <Group gap="sm" align="center" wrap="nowrap">
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em', flexShrink: 0 }}>
          PMAR
        </Text>
        <Divider orientation="vertical" color="var(--modal-divider)" />

        {hasIndicators && (
          <>
            <SegmentedControl
              size="xs"
              value={activeIndicator}
              onChange={onIndicatorChange}
              data={INDICATORS.map(({ key, labelKey }) => ({ value: key, label: c[labelKey] }))}
              color="blue"
            />
            <Divider orientation="vertical" color="var(--modal-divider)" />
          </>
        )}

        <Tooltip label={showPmarRaster ? c.hideRaster : c.showRaster} withArrow>
          <ActionIcon
            size="sm"
            variant={showPmarRaster ? 'filled' : 'subtle'}
            color="blue"
            onClick={onTogglePmarRaster}
          >
            {showPmarRaster ? <IconEye size={14} /> : <IconEyeOff size={14} />}
          </ActionIcon>
        </Tooltip>

        <Tooltip label={showSeedShape ? c.hideSeed : c.showSeed} withArrow>
          <ActionIcon
            size="sm"
            variant={showSeedShape ? 'filled' : 'subtle'}
            color="blue"
            onClick={onToggleSeedShape}
          >
            <IconCircle size={14} />
          </ActionIcon>
        </Tooltip>

        {hasWindFarms && (
          <Tooltip label={showWindFarms ? c.hideWindFarms : c.showWindFarms} withArrow>
            <ActionIcon
              size="sm"
              variant={showWindFarms ? 'filled' : 'subtle'}
              color="blue"
              onClick={onToggleWindFarms}
            >
              <IconWind size={14} />
            </ActionIcon>
          </Tooltip>
        )}

        {hasOffshoreInstallations && (
          <Tooltip label={showOffshoreInstallations ? c.hideOffshore : c.showOffshore} withArrow>
            <ActionIcon
              size="sm"
              variant={showOffshoreInstallations ? 'filled' : 'subtle'}
              color="blue"
              onClick={onToggleOffshoreInstallations}
            >
              <IconDroplet size={14} />
            </ActionIcon>
          </Tooltip>
        )}

        <Divider orientation="vertical" color="var(--modal-divider)" />
        <Tooltip label={c.downloadRaster} withArrow>
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={onDownloadPmar}>
            <IconDownload size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Paper>
  )
}
