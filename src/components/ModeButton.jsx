function ModeButton({ icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '10px 16px',
        borderRadius: '14px',
        background: active ? '#1E1E3F' : 'transparent',
        border: active ? '2px solid #6BCB77' : '2px solid #2E2E5E',
        color: '#E8E8FF',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontFamily: 'Nunito, sans-serif',
        fontSize: '14px',
        fontWeight: 600
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#1E1E3F'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? '#1E1E3F' : 'transparent'
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

export default ModeButton
