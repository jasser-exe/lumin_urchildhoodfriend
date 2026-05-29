function ChatMessage({ role, text }) {
  const isLumin = role === 'lumin'

  return (
    <div className={`message-enter flex ${isLumin ? 'flex-row' : 'flex-row-reverse'} items-start gap-2`}>
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full"
        style={{ background: '#2E2E5E' }}
      >
        {isLumin ? '🌟' : '👤'}
      </div>
      <div
        style={{
          background: isLumin ? '#1E1E3F' : '#1a3a2a',
          border: isLumin ? '1px solid #2E2E5E' : '1px solid #2d5a3d',
          borderRadius: isLumin ? '4px 18px 18px 18px' : '18px 4px 18px 18px',
          padding: '12px 16px',
          maxWidth: '75%',
          color: '#E8E8FF',
          fontSize: '15px',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap'
        }}
      >
        {text}
      </div>
    </div>
  )
}

export default ChatMessage
