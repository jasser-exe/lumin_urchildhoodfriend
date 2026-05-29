import { useMemo, useState } from 'react'
import { EMOTION_BADGE_COLORS } from '../lib/emotions'

function relativeTime(value) {
  const date = new Date(value)
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  const hours = Math.floor(diffMinutes / 60)
  return `${hours} hours ago`
}

function capitalize(text) {
  if (!text) return 'Neutral'
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function getTrend(logs) {
  if (!logs.length) return { icon: '➡️', label: 'Stable', color: '#9898CC' }

  const happyCount = logs.filter((l) => l.emotion === 'happy').length
  const needsAttentionCount = logs.filter((l) => l.emotion === 'sad' || l.emotion === 'anxious').length

  if (happyCount > logs.length / 2) return { icon: '📈', label: 'Improving', color: '#6BCB77' }
  if (needsAttentionCount > logs.length / 2) return { icon: '📉', label: 'Needs Attention', color: '#FF6B6B' }
  return { icon: '➡️', label: 'Stable', color: '#9898CC' }
}

function activityIcon(type) {
  if (type === 'story') return '📖'
  if (type === 'game') return '🎮'
  return '💬'
}

function ChildCard({ session, alerts, emotionLogs, activities, onAcknowledge }) {
  const [expanded, setExpanded] = useState(false)

  const trend = useMemo(() => getTrend(emotionLogs), [emotionLogs])
  const emotionColor = EMOTION_BADGE_COLORS[session.current_emotion] || '#9898CC'

  return (
    <div className="rounded-[18px] border p-5" style={{ background: '#1E1E3F', borderColor: '#2E2E5E' }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div style={{ fontFamily: 'Fredoka One, cursive', fontSize: '1.1rem', color: '#E8E8FF' }}>{session.child_name}</div>
          <div className="text-xs" style={{ color: '#9898CC' }}>
            Last active: {relativeTime(session.last_active)}
          </div>
        </div>
        <div
          className="rounded-full border px-3 py-1 text-xs"
          style={{ borderColor: emotionColor, color: emotionColor, background: `${emotionColor}20` }}
        >
          {capitalize(session.current_emotion)}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <div className="rounded-full border px-3 py-1" style={{ borderColor: '#2E2E5E' }}>
          💬 {session.messages_count || 0} messages
        </div>
        <div className="rounded-full border px-3 py-1" style={{ borderColor: '#2E2E5E' }}>
          ⭐ {session.score || 0} pts
        </div>
        <div className="rounded-full border px-3 py-1" style={{ borderColor: '#2E2E5E' }}>
          📖 {session.story_episode || 0} episodes
        </div>
      </div>

      <div className="mb-3 text-sm" style={{ color: trend.color }}>
        {trend.icon} {trend.label}
      </div>

      {alerts.length > 0 && (
        <div className="mb-3 space-y-2 rounded-[10px] border p-2" style={{ background: '#3a0a0a', borderColor: '#FF6B6B' }}>
          {alerts.map((alert) => (
            <div key={alert.id} className="flex items-center justify-between gap-2 text-sm" style={{ color: '#FF6B6B' }}>
              <span>{alert.reason}</span>
              <button
                type="button"
                className="rounded-full border px-2 py-1 text-xs"
                style={{ borderColor: '#FF6B6B', color: '#FF6B6B' }}
                onClick={() => onAcknowledge(alert.id)}
              >
                Mark seen ✓
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="mb-2 text-sm"
        style={{ color: '#9898CC' }}
      >
        {expanded ? 'Hide details ▴' : 'Show details ▾'}
      </button>

      {expanded && (
        <div className="space-y-3 text-sm">
          <div>
            <div className="mb-2" style={{ color: '#E8E8FF', fontWeight: 700 }}>
              Recent emotions:
            </div>
            <div className="space-y-1">
              {emotionLogs.slice(0, 5).map((log) => {
                const color = EMOTION_BADGE_COLORS[log.emotion] || '#9898CC'
                return (
                  <div key={log.id} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: '#9898CC' }}>
                      {new Date(log.logged_at).toLocaleTimeString()}
                    </span>
                    <span className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: color, color }}>
                      {capitalize(log.emotion)}
                    </span>
                  </div>
                )
              })}
              {emotionLogs.length === 0 && (
                <div className="text-xs" style={{ color: '#9898CC' }}>
                  No emotion logs yet.
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2" style={{ color: '#E8E8FF', fontWeight: 700 }}>
              Recent activity:
            </div>
            <div className="space-y-1">
              {activities.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between gap-2 text-xs">
                  <span style={{ color: '#E8E8FF' }}>
                    {activityIcon(activity.activity_type)} {activity.detail}
                  </span>
                  <span style={{ color: '#9898CC' }}>{new Date(activity.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
              {activities.length === 0 && (
                <div className="text-xs" style={{ color: '#9898CC' }}>
                  No activity yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChildCard
