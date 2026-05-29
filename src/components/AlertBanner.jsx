function AlertBanner({ message, onDismiss }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: '#3a0a0a',
        borderBottom: '2px solid #FF6B6B',
        padding: '12px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <div style={{ color: '#FF6B6B', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>⚠️</span>
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        style={{ background: 'transparent', border: 'none', color: '#FF6B6B', cursor: 'pointer', fontSize: '18px' }}
      >
        ✕
      </button>
    </div>
  )
}

export default AlertBanner
