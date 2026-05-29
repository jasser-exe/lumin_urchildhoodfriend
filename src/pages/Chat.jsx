import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AlertBanner from '../components/AlertBanner'
import ChatMessage from '../components/ChatMessage'
import GamePanel from '../components/GamePanel'
import LuminCharacter from '../components/LuminCharacter'
import ModeButton from '../components/ModeButton'
import StoryThemeSelector from '../components/StoryThemeSelector'
import TypingIndicator from '../components/TypingIndicator'
import MusicPanel from '../components/MusicPanel'
import { useEmotionTracker } from '../hooks/useEmotionTracker'
import { useSession } from '../hooks/useSession'
import { callAI } from '../lib/ai'
import { detectEmotion, detectEmotionDetailed, EMOTION_TO_MOOD } from '../lib/emotions'
import EmotionBadge from '../components/EmotionBadge'
import { useTranslation } from 'react-i18next'
import { speak, startListening, stopSpeaking } from '../lib/speech'
import { supabase } from '../lib/supabase'

const CHILD_ACCOUNT_KEY = 'luminChildAccount'

const RIDDLES = {
  1: [
    { q: "I have pages but I'm not a tree. What am I?", a: 'book', points: 10 },
    { q: "The more I dry, the wetter I get. What am I?", a: 'towel', points: 10 },
    { q: "I have no legs but I run everywhere in the house. What am I?", a: 'water', points: 10 }
  ],
  2: [
    {
      q: "I run but have no legs, I have a bed but never sleep. What am I?",
      a: 'river',
      points: 20
    },
    {
      q: "You throw me when you need me and take me back when you don't. What am I?",
      a: 'anchor',
      points: 20
    }
  ],
  3: [
    { q: "I speak all languages but have no mouth. What am I?", a: 'echo', points: 30 },
    { q: "I am always ahead of you but can never be seen. What am I?", a: 'future', points: 30 }
  ]
}

function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function checkAnswer(userInput, correct) {
  return normalize(userInput).includes(normalize(correct))
}

function getTitle(score) {
  if (score >= 150) return 'Legend'
  if (score >= 80) return 'Champion'
  if (score >= 30) return 'Adventurer'
  return 'Explorer'
}

function detectIntent(message) {
  const lower = normalize(message)
  const storyKeywords = ['story', 'tale', 'adventure', 'tell', "i want a story", 'storytime', 'history']
  const gameKeywords = ['riddle', 'game', 'quiz', 'play']
  const musicKeywords = ['song', 'music', 'sing', 'listen', 'playlist']

  if (storyKeywords.some((word) => lower.includes(word))) return 'story'
  if (gameKeywords.some((word) => lower.includes(word))) return 'game'

  if (musicKeywords.some((word) => lower.includes(word))) return 'music'

  if (/^(i want|i would like|i'd like|want|give me)\b/.test(lower)) {
    if (lower.includes('story') || lower.includes('adventure')) return 'story'
    if (lower.includes('game') || lower.includes('riddle') || lower.includes('play')) return 'game'
  }

  if (/(what can you|help me|what do you do|how can you)/i.test(lower)) return 'help'

  return null
}

function detectTheme(message) {
  const lower = normalize(message)

  if (lower.includes('space')) return 'Space'
  if (lower.includes('ocean') || lower.includes('sea')) return 'Ocean'
  if (lower.includes('forest')) return 'Forest'
  if (lower.includes('dragon')) return 'Dragons'
  if (lower.includes('fairy') || lower.includes('fae')) return 'Fairies'
  return 'Adventure'
}

function detectLevel(message) {
  const lower = normalize(message)
  const levelMatch = lower.match(/level\s*([123])/)
  if (levelMatch) return Number(levelMatch[1])
  if (lower.includes('hard') || lower.includes('difficult')) return 3
  if (lower.includes('medium') || lower.includes('easyish')) return 2
  return 1
}

function isPersonalSelfTalk(message, intent) {
  if (intent === 'story' || intent === 'game') return false

  const lower = normalize(message)
  if (lower.startsWith('je choisis') || lower === '1' || lower === '2') return false

  if (lower.startsWith('i choose') || lower === '1' || lower === '2') return false

  const personalMarkers = [
    'i am',
    "i'm",
    'i feel',
    'i want to talk',
    'i have',
    'me',
    'my',
    'mom',
    'dad',
    'hospital',
    'at home'
  ]

  return personalMarkers.some((marker) => lower.includes(marker))
}

function extractPreferenceFact(message) {
  const normalized = message.trim()
  if (!normalized) return null

  const likeMatch = normalized.match(/I like\s+([^.!?]{2,60})/i)
  if (likeMatch?.[1]) {
    return `Likes: ${likeMatch[1].trim()}`
  }

  const favoriteMatch = normalized.match(/(?:my)\s+([^.!?]{2,30})\s+favorite\s+is\s+([^.!?]{2,40})/i)
  if (favoriteMatch?.[1] && favoriteMatch?.[2]) {
    return `Prefers ${favoriteMatch[1].trim()}: ${favoriteMatch[2].trim()}`
  }

  return null
}

function buildMemoryContext(emotions, profileFacts, activityHighlights) {
  const parts = []

  if (profileFacts.length) {
    parts.push(`Known preferences: ${profileFacts.join(' | ')}`)
  }

  if (emotions.length) {
    const emotionsSummary = emotions.map((item) => item.emotion).join(', ')
    parts.push(`Recent emotions: ${emotionsSummary}`)
  }

  if (activityHighlights.length) {
    parts.push(`Recent activities: ${activityHighlights.join(' | ')}`)
  }

  return parts.join(' ; ')
}

function Chat() {
  const navigate = useNavigate()
  const [childAccount, setChildAccount] = useState(null)
  const childName = childAccount?.displayName || childAccount?.username || 'ami'
  const childId = childAccount?.id || null
  const FAVORITES_KEY = 'luminMusicFavorites'
  const [memoryContext, setMemoryContext] = useState('')

  const [mode, setMode] = useState('chat')
  const [messages, setMessages] = useState([])
  const [mood, setMood] = useState('happy')
  const [isLoading, setIsLoading] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [detectedEmotion, setDetectedEmotion] = useState('neutral')
  const [emotionConfidence, setEmotionConfidence] = useState(0)
  const { t, i18n } = useTranslation()
  const [language, setLanguage] = useState(i18n.language || 'en')
  const [micSupported, setMicSupported] = useState(true)
  
  const [score, setScore] = useState(0)
  const [alertBanner, setAlertBanner] = useState(null)
  const [input, setInput] = useState('')
  const [storyState, setStoryState] = useState({
    active: false,
    theme: null,
    summary: '',
    episode: 0,
    awaitingChoice: false,
    choices: [],
    awaitingClarify: false,
    clarifyQuestion: null
  })
  const [gameState, setGameState] = useState({
    active: false,
    level: null,
    riddle: null,
    correctAnswer: null,
    points: 0
  })
  const [showStoryThemes, setShowStoryThemes] = useState(false)
  const [showLevelSelector, setShowLevelSelector] = useState(false)
  const [musicTracks, setMusicTracks] = useState([])
  const [currentTrackId, setCurrentTrackId] = useState(null)
  const [favoriteTrackIds, setFavoriteTrackIds] = useState(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })

  const messagesEndRef = useRef(null)
  const processingChoiceRef = useRef(false)

  const { addEmotion, shouldAlert } = useEmotionTracker()
  const { createSession, updateSession, logEmotion, logActivity, logAlert } = useSession()

  useEffect(() => {
    // Initialize welcome message translated
    setMessages([
      {
        role: 'lumin',
        text: t('ui.default_reply') || "Hello! 😊 I'm Lumin, your magic friend. How are you today?"
      }
    ])

    async function initChildContext() {
      let account = null
      try {
        const raw = localStorage.getItem(CHILD_ACCOUNT_KEY)
        account = raw ? JSON.parse(raw) : null
      } catch {
        account = null
      }

      if (!account?.username && !account?.displayName) {
        navigate('/kid-login')
        return
      }

      setChildAccount(account)
      const resolvedName = account.displayName || account.username
      localStorage.setItem('childName', resolvedName)
      createSession(resolvedName, account.id || null)

      try {
        const { data: emotionRows } = await supabase
          .from('emotion_logs')
          .select('emotion')
          .eq('child_id', account.id)
          .order('logged_at', { ascending: false })
          .limit(6)

        const { data: profileRows } = await supabase
          .from('activities')
          .select('detail')
          .eq('child_id', account.id)
          .eq('activity_type', 'profile')
          .order('created_at', { ascending: false })
          .limit(6)

        const { data: activityRows } = await supabase
          .from('activities')
          .select('detail')
          .eq('child_id', account.id)
          .in('activity_type', ['chat', 'story', 'game'])
          .order('created_at', { ascending: false })
          .limit(5)

        const nextContext = buildMemoryContext(
          emotionRows || [],
          (profileRows || []).map((row) => row.detail).filter(Boolean),
          (activityRows || []).map((row) => row.detail).filter(Boolean)
        )
        setMemoryContext(nextContext)
        // load persisted game wins / lock state / hearts from localStorage per child
        try {
          const keyBase = account.id || resolvedName
          const winsKey = `gameWins_${keyBase}`
          const lockKey = `gameLockedUntil_${keyBase}`
          const heartsKey = `gameHearts_${keyBase}`
          const winsRaw = localStorage.getItem(winsKey)
          const lockRaw = localStorage.getItem(lockKey)
          const heartsRaw = localStorage.getItem(heartsKey)
          const wins = winsRaw ? Number(winsRaw) : 0
          const lockedUntil = lockRaw ? Number(lockRaw) : null
          const hearts = heartsRaw ? JSON.parse(heartsRaw) : null
          setGameState((prev) => ({ ...prev, wins: wins || 0, lockedUntil: lockedUntil || null, hearts: hearts || prev.hearts }))
        } catch {
          // ignore localStorage issues
        }
      } catch {
        setMemoryContext('')
      }
    }

    initChildContext()
  }, [createSession, navigate])

  useEffect(() => {
    setMessages((prev) => {
      if (!childName || !prev.length || prev[0].role !== 'lumin') return prev
      const next = [...prev]
      next[0] = {
        ...next[0],
        text: t('ui.welcome_name', { childName })
      }
      return next
    })
  }, [childName, t])

  // update welcome message when language changes
  useEffect(() => {
    setMessages((prev) => {
      if (!prev.length || prev[0].role !== 'lumin') return prev
      const next = [...prev]
      // try to keep childName substitution if available
      const name = childName || (localStorage.getItem('childName') || '')
      try {
        if (name) next[0] = { ...next[0], text: t('ui.welcome_name', { childName: name }) }
        else next[0] = { ...next[0], text: t('ui.default_reply') }
      } catch {
        // fallback: no-op
      }
      return next
    })
  }, [language, t])

  // When the UI mode changes away from 'game', ensure the game UI is closed.
  useEffect(() => {
    if (mode !== 'game' && gameState.active) {
      setGameState((prev) => ({ ...prev, active: false }))
    }
  }, [mode])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteTrackIds))
  }, [favoriteTrackIds])

  useEffect(() => {
    return () => {
      musicTracks.forEach((track) => {
        if (track.url?.startsWith('blob:')) {
          URL.revokeObjectURL(track.url)
        }
      })
    }
  }, [musicTracks])

  useEffect(() => {
    const supported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
    setMicSupported(supported)
  }, [])

  useEffect(() => {
    // voice style removed from UI; keep default behavior in speech module
  }, [])

  useEffect(() => {
    function onStart() {
      setIsSpeaking(true)
    }
    function onEnd() {
      setIsSpeaking(false)
    }
    window.addEventListener('lumin-speech-start', onStart)
    window.addEventListener('lumin-speech-end', onEnd)
    return () => {
      window.removeEventListener('lumin-speech-start', onStart)
      window.removeEventListener('lumin-speech-end', onEnd)
    }
  }, [])

  function buildSystemPrompt(currentMode, currentStoryState, lang = language) {
    // use i18n translations for system prompt templates
    const base = t('system.base', { childName })
    if (currentMode === 'story' && currentStoryState.theme) {
      return `${base}\n${t('system.story')}`
    }
    if (currentMode === 'game') {
      return `${base}\n${t('system.game')}`
    }
    return base
  }

  async function handleSend(text, opts = {}) {
    console.log('[Chat] handleSend called with:', text)
    if (!text || !text.trim()) {
      console.log('[Chat] handleSend: empty input, ignoring')
      return
    }

    const userMsg = text.trim()
    const preferenceFact = extractPreferenceFact(userMsg)
    const intent = detectIntent(userMsg)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }])

    const det = detectEmotionDetailed(userMsg)
    const emotion = det.emotion
    const newMood = EMOTION_TO_MOOD[emotion]
    const confidence = det.confidence || 0
    setDetectedEmotion(emotion)
    setEmotionConfidence(confidence)
    setMood(newMood)
    addEmotion(emotion)

    // If the user replies with a short confirmation like "done" after an action prompt
    // (for example, after Lumin asked to take a sip of water), handle locally so
    // we don't accidentally restart the conversation or re-greet.
    try {
      const simpleConfirmRe = /^\s*(done|ok(?:ay)?|yes|yep|i did|i drank|i took it)\b/i
      const prevLum = [...messages].slice().reverse().find((m) => m.role === 'lumin')
      const prevText = prevLum && prevLum.text ? prevLum.text.toLowerCase() : ''
      const askedForHydration = /sip|drink|water|hydrate|hydrated|take a few sips|have some water/.test(prevText)
      if (simpleConfirmRe.test(userMsg) && askedForHydration) {
        const follow = "Great — thanks for taking a sip! Are you feeling better now?"
        setMessages((prev) => [...prev, { role: 'lumin', text: follow }])
        speak(follow, language)
        logActivity(childName, childId, 'chat', 'confirmation:hydration')
        updateSession({ current_emotion: emotion, current_mood: newMood, messages_count: messages.length + 2 })
        return
      }
    } catch (e) {
      console.warn('confirm-handling failed', e)
    }

    // Update short-term memory context so Lumin adapts as the child speaks.
    // Keep this lightweight: add recent emotion and a short activity preview.
    const shortPreview = userMsg.slice(0, 80)
    setMemoryContext((prev) => {
      const parts = prev ? prev.split(' ; ').filter(Boolean) : []
      const emotionSnippet = `Recent emotions: ${emotion}`
      const activitySnippet = `Recent activity: ${shortPreview}`
      // Avoid exact duplicates
      if (!parts.some((p) => p === emotionSnippet)) parts.unshift(emotionSnippet)
      if (!parts.some((p) => p === activitySnippet)) parts.unshift(activitySnippet)
      // If preference was already present, keep it; otherwise we may add it below.
      const next = parts.join(' ; ')
      return next.slice(0, 900)
    })

    const emotionExpressed = emotion !== 'neutral'

    if (shouldAlert()) {
      const reason = `${childName} expressed sadness or anxiety twice in a row`
      setAlertBanner(reason)
      logAlert(childName, childId, reason)
    }

    let effectiveMode = mode
    let effectiveStoryState = storyState

    // If the child shifts to emotional expression, stop the active game block
    // and return to normal chat so Lumin can respond empathetically.
    if (gameState.active && emotionExpressed) {
      setGameState((prev) => ({ ...prev, active: false }))
      setShowLevelSelector(false)
      stopSpeaking()
      setMode('chat')
      logActivity(childName, childId, 'game', "Game interrupted: emotional expression")
      effectiveMode = 'chat'
    }

    if (storyState.active && effectiveMode === 'story' && isPersonalSelfTalk(userMsg, intent)) {
      const resetStoryState = {
        active: false,
        theme: null,
        summary: '',
        episode: 0,
        awaitingChoice: false,
        choices: []
      }

      setStoryState(resetStoryState)
      setShowStoryThemes(false)
      stopSpeaking()
      setMode('chat')
      logActivity(childName, childId, 'story', 'Story interrupted: personal sharing')
      effectiveMode = 'chat'
      effectiveStoryState = resetStoryState
    }

    if (intent === 'story' && mode !== 'story') {
      const theme = detectTheme(userMsg)
      const nextStoryState = {
        active: true,
        theme,
        summary: '',
        episode: 0,
        awaitingChoice: false,
        choices: []
      }

      stopSpeaking()
      setMode('story')
      setShowStoryThemes(false)
      setShowLevelSelector(false)
      setStoryState(nextStoryState)
      logActivity(childName, childId, 'story', `Auto theme: ${theme}`)

      effectiveMode = 'story'
      effectiveStoryState = nextStoryState
    }

    // If we're awaiting a choice in story mode and this message looks like a choice,
    // handle it locally (accept '1'/'2', exact choice text, or "I choose X").
    // `opts.skipChoice` allows callers (like UI-driven choice handlers) to bypass
    // local choice detection to avoid recursive loops.
    if (!opts.skipChoice && mode === 'story' && storyState.awaitingChoice && !storyState.awaitingClarify) {
      const lower = normalize(userMsg)
      if (lower === '1' || lower === '2') {
        const idx = Number(lower) - 1
        const choice = storyState.choices[idx]
        if (choice) {
          handleStoryChoice(choice)
          return
        }
      }

      const chooseMatch = userMsg.match(/^\s*(?:i choose[:\s]*)(.+)/i)
      if (chooseMatch && chooseMatch[1]) {
        const chosen = chooseMatch[1].trim()
        const found = storyState.choices.find((c) => normalize(c) === normalize(chosen) || normalize(c).includes(normalize(chosen)) || normalize(chosen).includes(normalize(c)))
        if (found) {
          handleStoryChoice(found)
          return
        }
      }

      // direct exact match
      const direct = storyState.choices.find((c) => normalize(c) === normalize(userMsg))
      if (direct) {
        handleStoryChoice(direct)
        return
      }
    }

    if (intent === 'game' && mode !== 'game') {
      const level = detectLevel(userMsg)
      const list = RIDDLES[level]
      const riddle = list[Math.floor(Math.random() * list.length)]

      stopSpeaking()
      setMode('game')
      setShowStoryThemes(false)
      setShowLevelSelector(false)
      // preserve persisted hearts if present (survive reloads)
      const existingHearts = gameState.hearts && gameState.hearts.length ? gameState.hearts : null
      setGameState({
        active: true,
        level,
        riddle: riddle.q,
        correctAnswer: riddle.a,
        points: riddle.points,
        changeCount: 0,
        hearts:
          existingHearts || [
            { available: true, recoverAt: null },
            { available: true, recoverAt: null },
            { available: true, recoverAt: null }
          ]
      })
      setMessages((prev) => [...prev, { role: 'lumin', text: `🎮 Great idea! Switching to game mode!\n\n${riddle.q}` }])
      speak(t('ui.mode.game') + ' !', language)
      logEmotion(childName, childId, emotion, userMsg)
      logActivity(childName, childId, 'game', `Niveau auto ${level}`)
      updateSession({
        current_emotion: emotion,
        current_mood: newMood,
        messages_count: messages.length + 2
      })
      return
    }

    // If the user asked what Lumin can do, reply with a concise capabilities list locally
    if (intent === 'help') {
      const capsEn = "I can tell stories, play riddles, give hints, listen, and support you. Do you want a story or a game?"
      const msg = capsEn
      setMessages((prev) => [...prev, { role: 'lumin', text: msg }])
      speak(msg, 'en')
      logActivity(childName, childId, 'chat', 'asked capabilities')
      return
    }

    setIsLoading(true)
    const sendMode = effectiveMode === 'story' && effectiveStoryState && effectiveStoryState.active ? 'story' : 'normal'
    try { console.log('[Chat] sending to AI with mode:', sendMode, { mode, storyStateActive: storyState.active, effectiveMode, effectiveStoryState }) } catch {}
    if (intent === 'story' && mode !== 'story') {
      // give a quick friendly transition message when auto-switching into story mode
      setMessages((prev) => [...prev, { role: 'lumin', text: `📖 Okay, let's create a story about ${effectiveStoryState.theme || 'a fun theme'}!` }])
    }
    // augment memory with recent messages to give the model short-term context
    const recent = messages.slice(-6).map((m) => `${m.role}:${m.text}`).join(' | ')
    const memoryForAI = memoryContext ? `${memoryContext} ; Recent: ${recent}` : `Recent: ${recent}`
    const aiRes = await callAI(userMsg, buildSystemPrompt(effectiveMode, effectiveStoryState, language), memoryForAI, language, sendMode)
    setIsLoading(false)
    const reply = aiRes.reply || ''
    const structured = aiRes.structured || null
    const suggestedMode = aiRes.suggested_mode || null
    const memoryUpdate = aiRes.memory_update || null

    // If backend suggests a different mode (story/game/music), switch UI automatically
    if (suggestedMode && suggestedMode !== 'normal') {
      try {
        if (suggestedMode === 'story') {
          setMode('story')
        } else if (suggestedMode === 'game') {
          setMode('game')
        } else if (suggestedMode === 'music') {
          setMode('music')
        }
      } catch {}
    }

    // If backend provided an updated memory context, use it (keeps child personalization improving)
    if (memoryUpdate && typeof memoryUpdate === 'string') {
      setMemoryContext((prev) => {
        if (!prev) return memoryUpdate
        if (prev.includes(memoryUpdate)) return prev
        return `${prev} ; ${memoryUpdate}`.slice(0, 900)
      })
    }

    if (effectiveMode === 'story' && effectiveStoryState.active) {
      if (structured && Array.isArray(structured.choices) && structured.choices.length === 2) {
        // Use structured episode if provided
        if (structured.episode) {
          setMessages((prev) => [...prev, { role: 'lumin', text: structured.episode }])
        } else {
          setMessages((prev) => [...prev, { role: 'lumin', text: reply }])
        }

        setStoryState((prev) => ({
          ...prev,
          // If model requests clarification, wait for it instead of accepting immediate choices
          awaitingChoice: !structured.clarify,
          choices: [structured.choices[0], structured.choices[1]],
          summary: `${prev.summary} ${userMsg}`.trim(),
          awaitingClarify: Boolean(structured.clarify),
          clarifyQuestion: structured.clarify && structured.question ? structured.question : null
        }))

        // persist story state to backend
        try {
          const key = localStorage.getItem('childName') || childName
          fetch('http://localhost:8000/api/story-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ child_name: key, state: { ...storyState, awaitingChoice: true, choices: structured.choices } }) })
        } catch {}

        if (structured.clarify && structured.question) {
          setMessages((prev) => [...prev, { role: 'lumin', text: structured.question }])
          // persist story state with clarification awaiting
          try {
            const key = localStorage.getItem('childName') || childName
            fetch('http://localhost:8000/api/story-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ child_name: key, state: { ...storyState, awaitingClarify: true, clarifyQuestion: structured.question } }) })
          } catch {}
        } else {
          // persist story state when no clarification needed
          try {
            const key = localStorage.getItem('childName') || childName
            fetch('http://localhost:8000/api/story-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ child_name: key, state: { ...storyState, awaitingChoice: true, choices: structured.choices } }) })
          } catch {}
        }
      } else {
        // fallback to robust parsing from text reply
        const lines = reply.split('\n')
        const pickChoice = (num) => {
          const re = new RegExp('^\\s*' + num + '[\\)\\.\\:]\\s*(.*)$')
          for (const l of lines) {
            const m = l.trim().match(re)
            if (m && m[1]) return m[1].trim()
          }
          return null
        }
        const choice1 = pickChoice(1)
        const choice2 = pickChoice(2)
        setMessages((prev) => [...prev, { role: 'lumin', text: reply }])
        if (choice1 && choice2) {
          setStoryState((prev) => ({
            ...prev,
            awaitingChoice: true,
            choices: [choice1, choice2],
            summary: `${prev.summary} ${userMsg}`.trim(),
            awaitingClarify: false,
            clarifyQuestion: null
          }))
          // persist story state
          try {
            const key = localStorage.getItem('childName') || childName
            fetch('http://localhost:8000/api/story-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ child_name: key, state: { ...storyState, awaitingChoice: true, choices: [choice1, choice2] } }) })
          } catch {}
        }
      }
    } else {
      setMessages((prev) => [...prev, { role: 'lumin', text: reply }])
    }

    // speak either the structured episode or the plain reply
    speak(structured && structured.episode ? structured.episode : reply, language)
    logEmotion(childName, childId, emotion, userMsg)
      if (preferenceFact) {
        logActivity(childName, childId, 'profile', preferenceFact)
        setMemoryContext((prev) => {
          if (!prev) return `Known preferences: ${preferenceFact}`
          if (prev.includes(preferenceFact)) return prev
          return `${prev} ; New preference: ${preferenceFact}`
        })
      }
    logActivity(childName, childId, 'chat', userMsg.slice(0, 80))
    updateSession({
      current_emotion: emotion,
      current_mood: newMood,
      messages_count: messages.length + 2
    })

    if (opts && opts.skipChoice) {
      try { processingChoiceRef.current = false } catch {}
    }
  }

  async function handleMic() {
    if (!micSupported) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'lumin',
          text: "I can't use the microphone on this device. You can type, and I'm here for you 💛"
        }
      ])
      return
    }

    try {
      setIsListening(true)
      setMood('listening')
      const langTag = 'en-US'
      const text = await startListening(langTag)
      setIsListening(false)
      setMood('happy')

      if (!text || !text.trim()) {
        setMessages((prev) => [
          ...prev,
          { role: 'lumin', text: t('ui.no_heard') || "I didn't hear that. Try again? 🎤" }
        ])
        return
      }

      handleSend(text)
    } catch {
      setIsListening(false)
      setMood('happy')
      setMessages((prev) => [
        ...prev,
        {
          role: 'lumin',
          text: t('ui.mic_error') || "Oops, the mic didn't work. You can try again or type 💬"
        }
      ])
    }
  }

  function handleStoryClick() {
    stopSpeaking()
    setMode('story')
    setShowStoryThemes(true)
    setShowLevelSelector(false)
  }

  function handleThemeSelect(theme) {
    setShowStoryThemes(false)
    setStoryState({
      active: true,
      theme,
      summary: '',
      episode: 0,
      awaitingChoice: false,
      choices: []
    })
    handleSend(`I want a story about ${theme}. I'm the hero!`)
    logActivity(childName, childId, 'story', `Theme: ${theme}`)
  }

  function handleStoryChoice(choice) {
    if (processingChoiceRef.current) return
    processingChoiceRef.current = true
    // compute new episode for session update
    const newEpisode = (storyState.episode || 0) + 1
    const newSummary = storyState.summary || ''
    const newTheme = storyState.theme || null

    // update local story state immediately; defer sending the choice so React state settles
    setStoryState((prev) => ({
      ...prev,
      awaitingChoice: false,
      awaitingClarify: false,
      clarifyQuestion: null,
      episode: prev.episode + 1
    }))

    // Defer the send to avoid synchronous recursion between handleSend and handleStoryChoice
    setTimeout(() => {
      try { handleSend(`I choose: ${choice}`, { skipChoice: true }) } catch (e) { console.error('handleSend after choice failed', e) }
    }, 0)

    updateSession({
      story_episode: newEpisode,
      story_summary: newSummary,
      story_theme: newTheme
    })
  }

  function handleGameClick() {
    stopSpeaking()
    setMode('game')
    setShowLevelSelector(true)
    setShowStoryThemes(false)
  }

  function handleMusicClick() {
    stopSpeaking()
    setMode('music')
    setShowStoryThemes(false)
    setShowLevelSelector(false)
  }

  async function handleChildSwitch() {
    try {
      await supabase.auth.signOut()
    } catch {
      // Silent fail
    }
    localStorage.removeItem(CHILD_ACCOUNT_KEY)
    localStorage.removeItem('childName')
    navigate('/kid-login')
  }

  function handleImportTracks(files) {
    const nextTracks = Array.from(files)
      .filter((file) => file.type.startsWith('audio/'))
      .map((file) => {
        const id = `${file.name}-${file.size}-${file.lastModified}`
        return {
          id,
          name: file.name.replace(/\.[^/.]+$/, ''),
          url: URL.createObjectURL(file)
        }
      })

    if (!nextTracks.length) return

    setMusicTracks((prev) => {
      const existing = new Set(prev.map((track) => track.id))
      const fresh = nextTracks.filter((track) => !existing.has(track.id))
      return [...prev, ...fresh]
    })

    if (!currentTrackId) {
      setCurrentTrackId(nextTracks[0].id)
    }
  }

  function handlePlayTrack(trackId) {
    setCurrentTrackId(trackId)
  }

  function toggleFavoriteTrack(trackId) {
    setFavoriteTrackIds((prev) => {
      if (prev.includes(trackId)) {
        return prev.filter((id) => id !== trackId)
      }
      return [...prev, trackId]
    })
  }

  function handleLevelSelect(level) {
    // If the riddles are locked due to earlier wins, prevent starting.
    const now = Date.now()
    if (gameState.lockedUntil && now < gameState.lockedUntil) {
      const ms = Math.max(0, gameState.lockedUntil - now)
      const sec = Math.ceil(ms / 1000)
      const min = Math.floor(sec / 60)
      const s = sec % 60
      const label = `${min}:${s.toString().padStart(2, '0')}`
      setMessages((prev) => [...prev, { role: 'lumin', text: `⏳ Riddles are locked. Come back in ${label}.` }])
      return
    }

    const list = RIDDLES[level]
    const riddle = list[Math.floor(Math.random() * list.length)]
    const existingHearts = gameState.hearts && gameState.hearts.length ? gameState.hearts : null
    setGameState({
      active: true,
      level,
      riddle: riddle.q,
      correctAnswer: riddle.a,
      points: riddle.points,
      changeCount: 0,
      wins: gameState.wins || 0,
      lockedUntil: gameState.lockedUntil || null,
      hearts: existingHearts || [
        { available: true, recoverAt: null },
        { available: true, recoverAt: null },
        { available: true, recoverAt: null }
      ]
    })
    setShowLevelSelector(false)
    setMessages((prev) => [...prev, { role: 'lumin', text: `🎮 Here's your riddle!\n\n${riddle.q}` }])
    logActivity(childName, childId, 'game', `Niveau ${level}`)
  }

  function handleGameAnswer(userInput) {
    if (checkAnswer(userInput, gameState.correctAnswer)) {
      const newScore = score + gameState.points
      setScore(newScore)
      setMessages((prev) => [
        ...prev,
        {
          role: 'lumin',
          text: `Great job ${childName}! 🎉 That's exactly it! You earned +${gameState.points} pts! You're awesome!`
        }
      ])
      speak('Great job! That is exactly it!', language)
      updateSession({ score: newScore })
      // increment wins and possibly lock riddles after 5 wins
      setGameState((prev) => {
        const prevWins = prev.wins || 0
        const wins = prevWins + 1
        const next = { ...prev, active: false, changeCount: 0, wins }
        // if reach 5 wins, lock for 30 minutes
        if (wins >= 5) {
          const lockedUntil = Date.now() + 30 * 60 * 1000
          next.lockedUntil = lockedUntil
          // persist lock and wins per child to localStorage
          try {
            const keyWins = `gameWins_${childId || childName}`
            const keyLock = `gameLockedUntil_${childId || childName}`
            localStorage.setItem(keyWins, String(wins))
            localStorage.setItem(keyLock, String(lockedUntil))
          } catch {}
          setMessages((prevMsgs) => [...prevMsgs, { role: 'lumin', text: "🔒 You've won 5 riddles! Riddles are locked for 30 minutes." }])
        } else {
          try {
            const keyWins = `gameWins_${childId || childName}`
            localStorage.setItem(keyWins, String(wins))
          } catch {}
        }
        return next
      })
      setShowLevelSelector(true)
      return
    }

    setMessages((prev) => [...prev, { role: 'lumin', text: `Not quite... Try again! 💪 You can do it!` }])
    speak("Not quite, try again!", language)
  }

  function handleGameClose() {
    setGameState((prev) => ({ ...prev, active: false }))
    setShowLevelSelector(true)
    setMode('chat')
  }

  function handleGameHint() {
    const answer = gameState.correctAnswer || ''
    const hint = answer
      ? `Hint: starts with "${answer.charAt(0).toUpperCase()}" and contains ${answer.length} letters.`
      : "Here's a hint: think about everyday objects..."
    setMessages((prev) => [...prev, { role: 'lumin', text: hint }])
    speak(hint, language)
    logActivity(childName, childId, 'game', "Hint requested")
  }

  function handleChangeRiddle() {
    // debug
    try { console.log('handleChangeRiddle called', { lockedUntil: gameState.lockedUntil, hearts: gameState.hearts }) } catch {}
    // prevent changes when riddles are locked due to too many wins
    const now = Date.now()
    if (gameState.lockedUntil && now < gameState.lockedUntil) {
      const ms = Math.max(0, gameState.lockedUntil - now)
      const sec = Math.ceil(ms / 1000)
      const min = Math.floor(sec / 60)
      const s = sec % 60
      const label = `${min}:${s.toString().padStart(2, '0')}`
      setMessages((prev) => [...prev, { role: 'lumin', text: `⏳ Riddles are locked. Come back in ${label}.` }])
      return
    }

    const list = RIDDLES[gameState.level || 1] || []
    if (!list.length) return

    const hearts = (gameState.hearts || []).slice()
    const idx = hearts.findIndex((h) => h && h.available)
      if (idx === -1) {
      // compute next recovery time
      const nextRecover = hearts.map((h) => h.recoverAt || 0).filter((t) => t > now).sort()[0]
      if (nextRecover) {
        const ms = Math.max(0, nextRecover - now)
        const sec = Math.ceil(ms / 1000)
        const min = Math.floor(sec / 60)
        const s = sec % 60
        const label = `${min}:${s.toString().padStart(2, '0')}`
          setMessages((prev) => [...prev, { role: 'lumin', text: `😅 All hearts are gone. Wait ${label} then try again.` }])
      } else {
        setMessages((prev) => [...prev, { role: 'lumin', text: '😅 All hearts are gone. Wait 2:00 then try again.' }])
      }
      return
    }

    const options = list.filter((r) => r.q !== gameState.riddle)
    const pick = options.length ? options[Math.floor(Math.random() * options.length)] : list[Math.floor(Math.random() * list.length)]

    hearts[idx] = { available: false, recoverAt: now + 2 * 60 * 1000 }
    setGameState((prev) => ({ ...prev, riddle: pick.q, correctAnswer: pick.a, points: pick.points, changeCount: (prev.changeCount || 0) + 1, hearts }))
    setMessages((prev) => [...prev, { role: 'lumin', text: `🔁 New riddle: ${pick.q}` }])
    logActivity(childName, childId, 'game', 'Riddle changed')
  }

  function handleChangeLevel(newLevel) {
    // change the game's difficulty level and consume a heart
    const now = Date.now()
    if (gameState.lockedUntil && now < gameState.lockedUntil) {
      const ms = Math.max(0, gameState.lockedUntil - now)
      const sec = Math.ceil(ms / 1000)
      const min = Math.floor(sec / 60)
      const s = sec % 60
      const label = `${min}:${s.toString().padStart(2, '0')}`
      setMessages((prev) => [...prev, { role: 'lumin', text: `⏳ Riddles are locked. Come back in ${label}.` }])
      return
    }

    const hearts = (gameState.hearts || []).slice()
    const idx = hearts.findIndex((h) => h && h.available)
    if (idx === -1) {
      setMessages((prev) => [...prev, { role: 'lumin', text: `😅 No hearts available to change level.` }])
      return
    }

    const list = RIDDLES[newLevel] || []
    if (!list.length) return
    const pick = list[Math.floor(Math.random() * list.length)]

    hearts[idx] = { available: false, recoverAt: now + 2 * 60 * 1000 }
    setGameState((prev) => ({ ...prev, level: newLevel, riddle: pick.q, correctAnswer: pick.a, points: pick.points, changeCount: (prev.changeCount || 0) + 1, hearts }))
    setMessages((prev) => [...prev, { role: 'lumin', text: `🔁 Level changed to ${newLevel} — New riddle: ${pick.q}` }])
    logActivity(childName, childId, 'game', `Level changed ${newLevel}`)
  }

  // Recover hearts over time (2 minutes per heart). Poll every 5s when game is active.
  useEffect(() => {
    let timer = null
    function checkRecover() {
      setGameState((prev) => {
        const hearts = (prev.hearts || []).slice()
        let changed = false
        let decCount = 0
        const now = Date.now()
        for (let i = 0; i < hearts.length; i++) {
          const h = hearts[i]
          if (h && !h.available && h.recoverAt && now >= h.recoverAt) {
            hearts[i] = { available: true, recoverAt: null }
            changed = true
            decCount += 1
          }
        }
        if (!changed) return prev
        const nextChangeCount = Math.max(0, (prev.changeCount || 0) - decCount)
        // notify child a heart recovered
        setMessages((msgs) => [...msgs, { role: 'lumin', text: '💖 A heart has recovered, you can change the riddle again.' }])
        return { ...prev, hearts, changeCount: nextChangeCount }
      })
    }

    if (gameState.active && gameState.hearts && gameState.hearts.length) {
      timer = setInterval(checkRecover, 5000)
    }

    return () => {
      if (timer) clearInterval(timer)
    }
  }, [gameState.active])

  // Monitor global lockedUntil and clear it when expired (runs independent of active game)
  useEffect(() => {
    let timer = null
    function checkLock() {
      setGameState((prev) => {
        if (!prev.lockedUntil) return prev
        const now = Date.now()
        if (now >= prev.lockedUntil) {
          // clear lock and reset wins
          try {
            const keyWins = `gameWins_${childId || childName}`
            const keyLock = `gameLockedUntil_${childId || childName}`
            localStorage.removeItem(keyWins)
            localStorage.removeItem(keyLock)
          } catch {}
          setMessages((msgs) => [...msgs, { role: 'lumin', text: '💖 Riddle lock lifted. You can play again!' }])
          return { ...prev, lockedUntil: null, wins: 0 }
        }
        return prev
      })
    }

    timer = setInterval(checkLock, 5000)
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [childId, childName])

  // Persist hearts, wins and lockedUntil to localStorage when they change
  useEffect(() => {
    try {
      const keyBase = childId || childName || localStorage.getItem(CHILD_ACCOUNT_KEY) || 'anon'
      const winsKey = `gameWins_${keyBase}`
      const lockKey = `gameLockedUntil_${keyBase}`
      const heartsKey = `gameHearts_${keyBase}`
      if (typeof gameState.wins !== 'undefined') localStorage.setItem(winsKey, String(gameState.wins || 0))
      if (gameState.lockedUntil) localStorage.setItem(lockKey, String(gameState.lockedUntil))
      else localStorage.removeItem(lockKey)
      if (gameState.hearts) localStorage.setItem(heartsKey, JSON.stringify(gameState.hearts))
    } catch {}
  }, [gameState.hearts, gameState.wins, gameState.lockedUntil, childId, childName])

  const modeTitle = useMemo(() => {
    if (mode === 'story') return 'Story'
    if (mode === 'game') return 'Game'
    if (mode === 'music') return 'Music'
    return 'Chat'
  }, [mode])

  return (
    <div className="h-screen overflow-hidden" style={{ background: '#0A0A1A' }}>
      {alertBanner && <AlertBanner message={alertBanner} onDismiss={() => setAlertBanner(null)} />}

      <div className="flex h-full overflow-hidden">
        <aside
          className="hidden h-full w-[240px] flex-col overflow-y-auto border-r p-5 md:flex"
          style={{ background: '#12122A', borderColor: '#2E2E5E' }}
        >
          <LuminCharacter mood={mood} isSpeaking={isSpeaking || isLoading} isListening={isListening} />

          {isSpeaking && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => stopSpeaking()}
                className="rounded-[10px] border px-3 py-2 text-sm"
                style={{ background: '#FFD93D', borderColor: '#2E2E5E', color: '#0A0A1A' }}
              >
                Stop Lumin
              </button>
            </div>
          )}

          <div className="mt-4 text-center">
            <div style={{ color: '#FFD93D', fontSize: '18px', fontWeight: 800 }}>⭐ {score} pts</div>
            <div style={{ color: '#9898CC', fontSize: '13px' }}>{getTitle(score)}</div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-xs" style={{ color: '#9898CC' }}>
              Mode
            </div>
            <div className="space-y-2">
              <ModeButton
                icon="💬"
                label="Chat"
                active={mode === 'chat'}
                onClick={() => {
                  stopSpeaking()
                  setMode('chat')
                  setShowStoryThemes(false)
                  setShowLevelSelector(false)
                }}
              />
              <ModeButton icon="📖" label="Story" active={mode === 'story'} onClick={handleStoryClick} />
              <ModeButton icon="🎮" label="Game" active={mode === 'game'} onClick={handleGameClick} />
              <ModeButton icon="🎵" label="Music" active={mode === 'music'} onClick={handleMusicClick} />
            </div>
          </div>

          {/* Voice controls removed from UI */}

          <div className="flex-1" />

          <div style={{ color: '#9898CC', fontSize: '12px' }}>Hello, {childName}! 👋</div>
          <button
            type="button"
            onClick={handleChildSwitch}
            className="mt-2 text-left text-xs"
            style={{ color: '#9898CC', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            Switch child account
          </button>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b px-6 py-4" style={{ background: '#12122A', borderColor: '#2E2E5E' }}>
            <div>
              <div className="text-lg" style={{ color: '#E8E8FF', fontFamily: 'Fredoka One, cursive' }}>
                {modeTitle}
              </div>
              <div className="text-sm" style={{ color: '#9898CC' }}>
                {t('ui.lumin_here')}
              </div>
              <div style={{ marginTop: 6 }}>
                <EmotionBadge emotion={detectedEmotion} confidence={emotionConfidence} />
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm" style={{ color: '#E8E8FF' }}>
              <div className="rounded px-2 py-1 text-sm" style={{ background: '#0F0F1A', color: '#E8E8FF', borderColor: '#2E2E5E' }}>
                EN
              </div>
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: '#6BCB77', boxShadow: '0 0 8px #6BCB77' }}
              />
              En ligne
            </div>
          </header>

          <section className="flex-1 overflow-y-auto p-5">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
              {messages.map((m, i) => (
                <ChatMessage key={`${m.role}-${i}`} role={m.role} text={m.text} />
              ))}
              {isLoading && <TypingIndicator />}

              {mode === 'story' && showStoryThemes && <StoryThemeSelector onSelect={handleThemeSelect} />}

              {mode === 'story' && storyState.awaitingChoice && storyState.choices.length === 2 && (
                <div className="message-enter flex flex-wrap gap-2">
                  {storyState.choices.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => handleStoryChoice(choice)}
                      className="rounded-[14px] border px-5 py-2 text-left transition-colors"
                      style={{ background: '#1E1E3F', borderColor: '#6BCB77', color: '#E8E8FF' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#12122A'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#1E1E3F'
                      }}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}

              {mode === 'game' && showLevelSelector && (
                <div className="message-enter flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleLevelSelect(1)}
                    className="rounded-[14px] border px-4 py-2"
                    style={{ background: '#1E1E3F', borderColor: '#2E2E5E', color: '#E8E8FF' }}
                  >
                    🌱 Niveau 1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLevelSelect(2)}
                    className="rounded-[14px] border px-4 py-2"
                    style={{ background: '#1E1E3F', borderColor: '#2E2E5E', color: '#E8E8FF' }}
                  >
                    ⭐ Niveau 2
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLevelSelect(3)}
                    className="rounded-[14px] border px-4 py-2"
                    style={{ background: '#1E1E3F', borderColor: '#2E2E5E', color: '#E8E8FF' }}
                  >
                    🏆 Niveau 3
                  </button>
                </div>
              )}

              {gameState.active && (
                <GamePanel
                  level={gameState.level}
                  riddle={gameState.riddle}
                  onAnswer={handleGameAnswer}
                  score={score}
                  onClose={handleGameClose}
                  onHint={handleGameHint}
                    onChangeRiddle={handleChangeRiddle}
                    onChangeLevel={handleChangeLevel}
                    lockedUntil={gameState.lockedUntil}
                    hearts={gameState.hearts}
                  changeCount={gameState.changeCount || 0}
                />
              )}

              {mode === 'music' && (
                <MusicPanel
                  tracks={musicTracks}
                  currentTrackId={currentTrackId}
                  onImportTracks={handleImportTracks}
                  onPlayTrack={handlePlayTrack}
                  favorites={favoriteTrackIds}
                  onToggleFavorite={toggleFavoriteTrack}
                />
              )}

              <div ref={messagesEndRef} />
            </div>
          </section>

          <div className="md:hidden" style={{ background: '#12122A', borderTop: '1px solid #2E2E5E', padding: '8px 12px' }}>
            <div className="grid grid-cols-4 gap-2">
              <ModeButton
                icon="💬"
                label="Chat"
                active={mode === 'chat'}
                onClick={() => {
                  stopSpeaking()
                  setMode('chat')
                  setShowStoryThemes(false)
                  setShowLevelSelector(false)
                }}
              />
              <ModeButton icon="📖" label="Story" active={mode === 'story'} onClick={handleStoryClick} />
              <ModeButton icon="🎮" label="Game" active={mode === 'game'} onClick={handleGameClick} />
              <ModeButton icon="🎵" label="Music" active={mode === 'music'} onClick={handleMusicClick} />
            </div>
          </div>

          <footer className="flex items-center gap-3 border-t px-6 py-4" style={{ background: '#12122A', borderColor: '#2E2E5E' }}>
            {/* voice display removed from mobile footer */}
            <button
              type="button"
              onClick={handleMic}
              disabled={isListening || isLoading || !micSupported}
              className={isListening ? 'mic-recording' : ''}
              title={micSupported ? (isListening ? "Listening..." : 'Talk to Lumin') : 'Microphone not available'}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '999px',
                background: isListening ? '#FF6B6B' : '#1E1E3F',
                border: `1px solid ${isListening ? '#FF6B6B' : '#2E2E5E'}`,
                cursor: isListening || isLoading || !micSupported ? 'not-allowed' : 'pointer',
                fontSize: '18px',
                opacity: micSupported ? 1 : 0.5
              }}
            >
              🎤
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend(input)
              }}
              placeholder={isListening ? "Listening... speak softly ✨" : 'Talk to Lumin...'}
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
              onClick={() => handleSend(input)}
              style={{
                background: '#6BCB77',
                color: '#0A0A1A',
                border: 'none',
                borderRadius: '14px',
                padding: '12px 18px',
                fontSize: '18px',
                cursor: 'pointer'
              }}
            >
              ➤
            </button>
          </footer>
        </main>
      </div>
    </div>
  )
}

export default Chat
