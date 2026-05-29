import { useState, useEffect } from 'react'

function getTitle(score) {
  if (score >= 150) return 'Legend'
  if (score >= 80) return 'Champion'
  if (score >= 30) return 'Adventurer'
  return 'Explorer'
}

function getLevelBadge(level) {
  if (level === 3) return '🏆'
  if (level === 2) return '⭐'
  return '🌱'
}

function GamePanel({ level, riddle, onAnswer, score, onClose, onHint, onChangeRiddle, onChangeLevel, changeCount = 0, hearts = [], lockedUntil = null }) {
  const [answer, setAnswer] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Debug: log state to help trace disabled button issues
  try {
    // eslint-disable-next-line no-console
    console.log('GamePanel render', { level, lockedUntil, hearts, changeCount })
  } catch {}

  function submit() {
    const value = answer.trim()
    if (!value) return
    onAnswer(value)
    setAnswer('')
  }

  return (
    <div className="message-enter rounded-2xl border p-4" style={{ background: '#1E1E3F', borderColor: '#2E2E5E' }}>
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm" style={{ borderColor: '#6BCB77', color: '#6BCB77' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{getLevelBadge(level)} Level {level}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => onChangeLevel && onChangeLevel(1)} className="rounded-[8px] px-2 py-1 text-xs" style={{ background: level === 1 ? '#6BCB77' : 'transparent', color: '#E8E8FF', border: '1px solid #2E2E5E' }}>1</button>
          <button type="button" onClick={() => onChangeLevel && onChangeLevel(2)} className="rounded-[8px] px-2 py-1 text-xs" style={{ background: level === 2 ? '#6BCB77' : 'transparent', color: '#E8E8FF', border: '1px solid #2E2E5E' }}>2</button>
          <button type="button" onClick={() => onChangeLevel && onChangeLevel(3)} className="rounded-[8px] px-2 py-1 text-xs" style={{ background: level === 3 ? '#6BCB77' : 'transparent', color: '#E8E8FF', border: '1px solid #2E2E5E' }}>3</button>
        </div>
      </div>

      <div className="mb-4 rounded-[14px] border p-4" style={{ background: '#12122A', borderColor: '#2E2E5E', color: '#E8E8FF' }}>
        {riddle}
      </div>

      <div className="flex gap-2">
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="Your answer..."
          style={{
            flex: 1,
            background: '#1E1E3F',
            border: '1px solid #2E2E5E',
            color: '#E8E8FF',
            borderRadius: '14px',
            padding: '12px 16px',
            fontFamily: 'Nunito, sans-serif',
            fontSize: '15px'
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#6BCB77'
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#2E2E5E'
          }}
        />
        <button
          type="button"
          onClick={submit}
          className="rounded-[14px] px-4 py-3"
          style={{ background: '#6BCB77', color: '#0A0A1A', border: 'none', fontWeight: 700 }}
          >
          Answer
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm" style={{ color: '#FFD93D' }}>
          ⭐ {score} pts — {getTitle(score)}
        </div>
        <div className="flex items-center gap-3">
          {/* hearts visual */}
          <div className="flex items-center gap-1 mr-2">
            {(hearts.length ? hearts : [{ available: true }, { available: true }, { available: true }]).map((h, i) => {
              const remaining = h && h.recoverAt ? Math.max(0, h.recoverAt - now) : 0
              const sec = Math.ceil(remaining / 1000)
              const min = Math.floor(sec / 60)
              const s = sec % 60
              const timerLabel = remaining > 0 ? `${min}:${s.toString().padStart(2, '0')}` : null
              return (
                <div key={i} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span className={h && h.available ? 'heart' : 'heart lost'} style={{ fontSize: 18 }}>
                    {h && h.available ? '❤️' : '🤍'}
                  </span>
                  {timerLabel && <span className="heart-timer" style={{ fontSize: 10, color: '#AAA', marginTop: 2 }}>{timerLabel}</span>}
                </div>
              )
            })}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onHint && onHint()}
              className="rounded-[12px] border px-3 py-1 text-sm"
              style={{ background: '#12122A', borderColor: '#2E2E5E', color: '#E8E8FF' }}
            >
              Hint
            </button>
            {(() => {
              const now = Date.now()
              const locked = lockedUntil && now < lockedUntil
              const hasHeart = (hearts || []).some((h) => h && h.available)
              const disabled = locked || !hasHeart
              let label = 'Change riddle'
              if (locked) {
                const ms = Math.max(0, lockedUntil - now)
                const sec = Math.ceil(ms / 1000)
                const min = Math.floor(sec / 60)
                const s = sec % 60
                label = `Locked (${min}:${s.toString().padStart(2, '0')})`
              }
              return (
                <button
                  type="button"
                  onClick={() => onChangeRiddle && onChangeRiddle()}
                  disabled={disabled}
                  className="rounded-[12px] border px-3 py-1 text-sm"
                  style={{
                    background: !disabled ? '#6BCB77' : '#2E2E2E',
                    borderColor: !disabled ? '#6BCB77' : '#444',
                    color: !disabled ? '#0A0A1A' : '#888'
                  }}
                >
                  {label}
                </button>
              )
            })()}
            <button
              type="button"
              onClick={() => onClose && onClose()}
              className="rounded-[12px] border px-3 py-1 text-sm"
              style={{ background: '#FF6B6B', borderColor: '#FF6B6B', color: '#0A0A1A' }}
            >
              Close game
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GamePanel
