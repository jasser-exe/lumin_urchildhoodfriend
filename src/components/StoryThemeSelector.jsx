const THEMES = ['🗺️ Adventure', '🚀 Space', '🌊 Ocean', '🌳 Forest', '🐉 Dragons', '🧚 Fairies']

function StoryThemeSelector({ onSelect }) {
  function handleSelect(theme) {
    const label = theme.replace(/^\S+\s/, '').trim()
    onSelect(label)
  }

  return (
    <div className="message-enter rounded-2xl border p-4" style={{ background: '#12122A', borderColor: '#2E2E5E' }}>
      <h3 className="mb-3 text-lg" style={{ color: '#E8E8FF' }}>
        Choose your adventure!
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {THEMES.map((theme) => {
          const [emoji, ...rest] = theme.split(' ')
          const label = rest.join(' ')
          return (
            <button
              key={theme}
              type="button"
              onClick={() => handleSelect(theme)}
              className="rounded-[14px] border p-4 text-center transition-all duration-200"
              style={{ background: '#1E1E3F', borderColor: '#2E2E5E' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#6BCB77'
                e.currentTarget.style.background = '#12122A'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#2E2E5E'
                e.currentTarget.style.background = '#1E1E3F'
              }}
            >
              <div style={{ fontSize: '24px' }}>{emoji}</div>
              <div style={{ fontSize: '13px', color: '#E8E8FF' }}>{label}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default StoryThemeSelector
