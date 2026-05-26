import { Tooltip, ActionIcon, Badge } from '@mantine/core'
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
      top: 110,
      right: 16,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      alignItems: 'center',
    }}>
      {TOOLS.map(({ key, Icon, labelKey }) => {
        const isActive  = activeMapTool === key
        const showBadge = key === 'comparison' && comparisonAreaCount > 0
        return (
          <Tooltip key={key} label={c[labelKey]} position="left" withArrow>
            <ActionIcon
              size={36}
              radius="md"
              variant={isActive ? 'filled' : 'default'}
              color={isActive ? 'blue' : undefined}
              disabled={!hasRaster}
              onClick={hasRaster ? () => onSetTool(key) : undefined}
              pos="relative"
              style={{
                backdropFilter: 'blur(20px) saturate(180%)',
                background: isActive
                  ? undefined
                  : 'var(--panel-bg)',
                border: isActive
                  ? undefined
                  : '1px solid var(--panel-border)',
              }}
            >
              <Icon size={16} />
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
                  }}
                >
                  {comparisonAreaCount}
                </Badge>
              )}
            </ActionIcon>
          </Tooltip>
        )
      })}

      {openWindowCount > 0 && (
        <>
          <div style={{
            width: 24,
            height: 1,
            background: 'var(--panel-border)',
            margin: '2px 0',
          }} />
          <Tooltip label={`${c.closeAllBtn} (${openWindowCount})`} position="left" withArrow>
            <div style={{ position: 'relative' }}>
              <ActionIcon
                size={36}
                radius="md"
                variant="subtle"
                color="red"
                onClick={onCloseAll}
                style={{
                  backdropFilter: 'blur(20px) saturate(180%)',
                  background: 'var(--panel-bg)',
                  border: '1px solid var(--panel-border)',
                }}
              >
                <IconX size={16} />
              </ActionIcon>
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
          </Tooltip>
        </>
      )}
    </div>
  )
}
