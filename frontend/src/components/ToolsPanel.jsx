import { useLang } from '../LanguageContext'
import './ToolsPanel.css'

const TOOLS = [
  { key: 'histogram',  icon: '📊', labelKey: 'histogramBtn' },
  { key: 'stats',      icon: '📋', labelKey: 'statsBtn' },
  { key: 'profile',    icon: '〰️', labelKey: 'profileBtn' },
  { key: 'threshold',  icon: '⚡', labelKey: 'thresholdBtn' },
  { key: 'csv',        icon: '📥', labelKey: 'csvBtn' },
  { key: 'comparison', icon: '⊞', labelKey: 'comparisonBtn' },
]

export default function ToolsPanel({
  activeMapTool,
  onSetTool,
  hasRaster,
  comparisonAreaCount = 0,
}) {
  const { t } = useLang()
  const c = t.toolsPanel

  return (
    <div className="tools-panel">
      <span className="tools-panel-label">{c.title}</span>
      <div className="tools-panel-sep" />
      {TOOLS.map(({ key, icon, labelKey }) => {
        const isActive = activeMapTool === key
        const isCsv    = key === 'csv'
        const badge    = key === 'comparison' && comparisonAreaCount > 0
          ? <span className="tools-panel-badge">{comparisonAreaCount} {c.comparisonAreas}</span>
          : null
        return (
          <button
            key={key}
            className={`tools-panel-btn${isActive ? ' active' : ''}${!hasRaster ? ' disabled' : ''}`}
            onClick={hasRaster ? () => onSetTool(key) : undefined}
            title={c[labelKey]}
            disabled={!hasRaster}
          >
            <span className="tools-panel-btn-icon">{icon}</span>
            <span className="tools-panel-btn-label">{c[labelKey]}</span>
            {!isCsv && badge}
          </button>
        )
      })}
    </div>
  )
}
