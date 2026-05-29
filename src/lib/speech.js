// Voice style handling removed; use consistent defaults.

function pickVoiceByLocale(locale = 'en') {
  const voices = window?.speechSynthesis?.getVoices?.() || []
  if (!voices.length) return null
  // Normalize locale to primary prefix 'en'
  const lower = (locale || 'en').toLowerCase()
  const langPrefix = lower.startsWith('en') ? 'en' : 'en'

  // Prefer voices that advertise the same language tag
  const matchByLang = voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith(langPrefix))
  if (matchByLang) return matchByLang

  // Fallback: try some known preferred names for the language
  const preferred = ['Google US English', 'Microsoft Zira', 'Microsoft David', 'Samantha', 'Google US English']

  for (const name of preferred) {
    const v = voices.find((voice) => voice.name === name)
    if (v) return v
  }

  // Last resort: return any voice (browser will try to synthesize in requested lang)
  return voices[0] || null
}

export function speak(text, locale = 'en') {
  if (!window?.speechSynthesis) return
  window.speechSynthesis.cancel()

  // Notify listeners that we are starting new speech
  try {
    window.dispatchEvent(new CustomEvent('lumin-speech-cancel'))
  } catch {}

  const utterance = new SpeechSynthesisUtterance(text)
  // Map locale to language tag
  const lang = locale && locale.startsWith('en') ? 'en-US' : 'en-US'
  utterance.lang = lang

  // Use a stable, child-friendly voice configuration
  utterance.rate = 0.98
  utterance.pitch = 1.02

  const voice = pickVoiceByLocale(locale)
  // Prefer a voice whose language matches the requested locale; otherwise let the browser choose
  if (voice && voice.lang && voice.lang.toLowerCase().startsWith('en')) {
    utterance.voice = voice
    utterance.lang = voice.lang || lang
  } else {
    // ensure utterance.lang matches requested language tag
    utterance.lang = lang
  }

  try {
    console.debug('[speak] locale=', locale, 'selectedVoice=', voice?.name, 'utterance.lang=', utterance.lang)
  } catch {}

  utterance.onstart = () => {
    try {
      window.__luminSpeaking = true
      window.dispatchEvent(new CustomEvent('lumin-speech-start'))
    } catch {}
  }

  utterance.onend = () => {
    try {
      window.__luminSpeaking = false
      window.dispatchEvent(new CustomEvent('lumin-speech-end'))
    } catch {}
  }

  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  if (!window?.speechSynthesis) return
  try {
    window.speechSynthesis.cancel()
    window.__luminSpeaking = false
    window.dispatchEvent(new CustomEvent('lumin-speech-end'))
  } catch {}
}

export function startListening(lang = 'en-US') {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return reject(new Error('SpeechRecognition not supported'))

    const recognition = new SR()
    recognition.lang = lang
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (e) => resolve(e.results[0][0].transcript)
    recognition.onerror = (e) => reject(new Error(e.error))
    recognition.start()
  })
}
