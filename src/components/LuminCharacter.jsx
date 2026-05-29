import { MOOD_COLORS, MOOD_EMOJI } from '../lib/emotions'

function withOpacity(hex, alpha = 0.2) {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function LuminCharacter({ mood, isSpeaking, isListening }) {
  const color = MOOD_COLORS[mood] || MOOD_COLORS.happy

  return (
    <div className="relative flex flex-col items-center gap-3">
      <div
        className="lumin-body relative"
        style={{
          width: '160px',
          height: '160px',
          borderRadius: '50%',
          background: '#1E1E3F',
          border: `3px solid ${color}`,
          '--mood-color': color
        }}
      >
        <div
          className="lumin-eye absolute flex items-center justify-center"
          style={{ width: '14px', height: '14px', background: '#fff', borderRadius: '50%', left: '48px', top: '60px' }}
        >
          <div style={{ width: '6px', height: '6px', background: '#0A0A1A', borderRadius: '50%' }} />
        </div>
        <div
          className="lumin-eye absolute flex items-center justify-center"
          style={{ width: '14px', height: '14px', background: '#fff', borderRadius: '50%', right: '48px', top: '60px' }}
        >
          <div style={{ width: '6px', height: '6px', background: '#0A0A1A', borderRadius: '50%' }} />
        </div>
        <div
          className="absolute"
          style={{
            width: '30px',
            height: '15px',
            borderBottom: '3px solid white',
            borderRadius: '0 0 50px 50px',
            left: '50%',
            bottom: '48px',
            transform: 'translateX(-50%)'
          }}
        />
      </div>

      {isListening && (
        <div className="flex items-end gap-1">
          <div className="sound-bar" style={{ width: '4px', minHeight: '6px', background: color, borderRadius: '4px' }} />
          <div className="sound-bar" style={{ width: '4px', minHeight: '6px', background: color, borderRadius: '4px' }} />
          <div className="sound-bar" style={{ width: '4px', minHeight: '6px', background: color, borderRadius: '4px' }} />
        </div>
      )}

      <div
        style={{
          background: withOpacity(color, 0.2),
          border: `1px solid ${color}`,
          color,
          fontSize: '12px',
          padding: '4px 10px',
          borderRadius: '20px'
        }}
      >
        {MOOD_EMOJI[mood] || '✨'} {mood}
      </div>
    </div>
  )
}

export default LuminCharacter
