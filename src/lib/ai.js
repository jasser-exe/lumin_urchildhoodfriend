export async function callAI(userMessage, systemPrompt, memoryContext = '', language = 'en', modeOverride = null) {
  const url = 'http://localhost:8000/api/chat'

  let childName = localStorage.getItem('childName') || 'ami'
  try {
    const raw = localStorage.getItem('luminChildAccount')
    const account = raw ? JSON.parse(raw) : null
    if (account?.displayName || account?.username) {
      childName = account.displayName || account.username
    }
  } catch {
    // Keep fallback name
  }

  const prompt = (systemPrompt || '').toLowerCase()
  let mode = 'normal'
  if (modeOverride) {
    mode = modeOverride === 'chat' ? 'normal' : modeOverride
  } else {
    // Detect story or game cues from the system prompt (English-only)
    if (prompt.includes('story') || prompt.includes('theme') || prompt.includes('story mode')) {
      mode = 'story'
    } else if (prompt.includes('game') || prompt.includes('riddle') || prompt.includes('play')) {
      mode = 'game'
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    let response

    try {
      const payload = {
        message: userMessage,
        child_name: childName,
        mode,
        memory_context: memoryContext,
        language
      }
      console.log('[AI] calling backend', url, payload)
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeout)
    }
    console.log('[AI] backend response status', response.status)
    if (!response.ok) {
      try {
        const text = await response.text()
        console.error('[AI] backend error response body:', text)
      } catch (e) {
        console.error('[AI] failed reading error body', e)
      }
      return { reply: "I'm here for you 💛", structured: null }
    }

    try {
      const data = await response.json()
      console.log('[AI] backend replied', data)
        return {
          reply: data?.reply || "I'm here for you 💛",
          structured: data?.structured || null,
          suggested_mode: data?.suggested_mode || null,
          memory_update: data?.memory_update || null
        }
    } catch (e) {
      console.error('[AI] failed parsing JSON reply', e)
      return { reply: "I'm here for you 💛", structured: null }
    }
  } catch {
    console.error('[AI] fetch failed', arguments)
    return { reply: "I'm here for you 💛", structured: null }
  }
}
