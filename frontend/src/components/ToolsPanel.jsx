import { Tooltip, Button, Badge } from '@mantine/core'
import {
  IconChartBar, IconChartAreaLine, IconWaveSine,
  IconBolt, IconFileTypeCsv, IconStack2, IconX,
} from '@tabler/icons-react'
import { useLang } from '../LanguageContext'

const TOOLS = [
  { key: 'histogram',  Icon: IconChartBar,      labelKey: 'histogramBtn' },
  { key: 'stats',      Icon: IconChartAreaLine,  labelKey: 'statsBtn' },
  { key: 'profile',    Icon: IconWaveSine,       labelKey: 'profileBtn' },
  { key: 'threshold',  Icon: IconBolt,           labelKey: 'thresholdBtn' },
  { key: 'csv',        Icon: IconFileTypeCsv,    labelKey: 'csvBtn' },
  { key: 'comparison', Icon: IconStack2,         labelKey: 'comparisonBtn' },
]

const BTN_WIDTH = 152

export default function ToolsPanel({
  activeMapTool,
  onSetTool,
  hasRaster,
  comparisonAreaCount = 0,
  openWindowCount = 0,
  onCloseAll,
}) {
  const { t } = useLang()
  const c = t.toolsPanel

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      right: 16,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      alignItems: 'stretch',
      width: BTN_WIDTH,
    }}>
      {TOOLS.map(({ key, Icon, labelKey }) => {
        const isActive  = activeMapTool === key
        const showBadge = key === 'comparison' && comparisonAreaCount > 0
        return (
          <div key={key} style={{ position: 'relative' }}>
            <Button
              fullWidth
              size="sm"
              radius="md"
              variant={isActive ? 'filled' : 'default'}
              color={isActive ? 'blue' : undefined}
              disabled={!hasRaster}
              leftSection={<Icon size={15} />}
              onClick={hasRaster ? () => onSetTool(key) : undefined}
              styles={{ inner: { justifyContent: 'flex-start' } }}
              style={{
                backdropFilter: 'blur(20px) saturate(180%)',
                background: isActive ? undefined : 'var(--panel-bg)',
                border: isActive ? undefined : '1px solid var(--panel-border)',
              }}
            >
              {c[labelKey]}
            </Button>
            {showBadge && (
              <Badge
                size="xs"
                color="blue"
                circle
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  fontSize: 8,
                  minWidth: 14,
                  height: 14,
                  padding: 0,
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              >
                {comparisonAreaCount}
              </Badge>
            )}
          </div>
        )
      })}

      {openWindowCount > 0 && (
        <>
          <div style={{
            height: 1,
            background: 'var(--panel-border)',
            margin: '2px 0',
          }} />
          <div style={{ position: 'relative' }}>
            <Button
              fullWidth
              size="sm"
              radius="md"
              variant="default"
              color="red"
              leftSection={<IconX size={15} />}
              onClick={onCloseAll}
              styles={{ inner: { justifyContent: 'flex-start' } }}
              style={{
                backdropFilter: 'blur(20px) saturate(180%)',
                background: 'var(--panel-bg)',
                border: '1px solid var(--panel-border)',
              }}
            >
              {c.closeAllBtn}
            </Button>
            <Badge
              size="xs"
              color="red"
              circle
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                fontSize: 8,
                minWidth: 14,
                height: 14,
                padding: 0,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            >
              {openWindowCount}
            </Badge>
          </div>
        </>
      )}
    </div>
  )
}
