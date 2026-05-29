import { EMOTION_BADGE_COLORS, MOOD_EMOJI } from '../lib/emotions'

function EmotionBadge({ emotion = 'neutral', confidence = 0 }) {
  const color = EMOTION_BADGE_COLORS[emotion] || '#9898CC'
  const emoji = MOOD_EMOJI[emotion] || '✨'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          background: color,
          color: '#0A0A1A',
          padding: '6px 8px',
          borderRadius: 16,
          fontWeight: 700,
          fontSize: 12,
          minWidth: 80,
          textAlign: 'center'
        }}
      >
        {emoji} {emotion}
      </div>
      <div style={{ color: '#9898CC', fontSize: 12 }}>{confidence ? `${Math.round(confidence * 100)}%` : ''}</div>
    </div>
  )
}

export default EmotionBadge
