function TypingIndicator() {
  return (
    <div className="message-enter flex items-start gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: '#2E2E5E' }}>
        🌟
      </div>
      <div
        className="inline-flex items-center gap-1"
        style={{ background: '#1E1E3F', border: '1px solid #2E2E5E', borderRadius: '4px 18px 18px 18px', padding: '12px 16px' }}
      >
        <span className="typing-dot inline-block" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9898CC' }} />
        <span className="typing-dot inline-block" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9898CC' }} />
        <span className="typing-dot inline-block" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9898CC' }} />
      </div>
    </div>
  )
}

export default TypingIndicator
