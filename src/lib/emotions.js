const EMOTION_LEXICON = {
  sad: [
    'sad',
    "i'm sad",
    'i am sad',
    'cry',
    'crying',
    'tears',
    'lonely',
    'alone',
    'depressed',
    'upset',
    'miserable',
    "i feel sad",
    'feeling sad'
  ],
  anxious: [
    'anxious',
    'anxiety',
    'worried',
    'worriedness',
    'nervous',
    'scared',
    'panic',
    'panic attack',
    'afraid',
    'fear'
  ],
  happy: [
    'happy',
    "i'm happy",
    'i am happy',
    'glad',
    'joy',
    'excited',
    'great',
    'yay',
    'cheerful',
    'fun',
    'love this'
  ],
  pain: ['hurt', 'pain', "i'm hurt", 'i am hurt', 'ow', 'ouch', 'it hurts', 'sore', 'injury', 'tired'],
  angry: ['angry', 'mad', 'annoyed', 'furious', 'upset', 'pissed', 'frustrated']
}

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreEmotion(normalizedText, words) {
  return words.reduce((score, word) => {
    return normalizedText.includes(word) ? score + 1 : score
  }, 0)
}

export function detectEmotionDetailed(text) {
  const normalized = normalize(text)
  if (!normalized) return { emotion: 'neutral', confidence: 0 }

  const scores = Object.entries(EMOTION_LEXICON).map(([emotion, words]) => ({
    emotion,
    score: scoreEmotion(normalized, words)
  }))

  scores.sort((a, b) => b.score - a.score)

  const top = scores[0]
  if (!top || top.score === 0) {
    // Catch explicit personal phrasing like "je suis triste" even if single match
    if (normalized.includes('je suis') || normalized.includes('je me sens') || normalized.includes("j'ai")) {
      for (const [emotion, words] of Object.entries(EMOTION_LEXICON)) {
        for (const w of words) {
          if (normalized.includes(w)) return { emotion, confidence: 0.6 }
        }
      }
    }
    return { emotion: 'neutral', confidence: 0 }
  }

  const total = scores.reduce((sum, item) => sum + item.score, 0)
  const confidence = total > 0 ? Number((top.score / total).toFixed(2)) : 0
  return { emotion: top.emotion, confidence }
}

export function detectEmotion(text) {
  return detectEmotionDetailed(text).emotion
}

export const EMOTION_TO_MOOD = {
  sad: 'sad',
  anxious: 'thinking',
  happy: 'excited',
  pain: 'calm',
  angry: 'calm',
  neutral: 'happy'
}

export const MOOD_COLORS = {
  happy: '#FFD93D',
  listening: '#6BCB77',
  thinking: '#4D96FF',
  excited: '#FF6B6B',
  calm: '#C77DFF',
  sad: '#6EC5FF'
}

export const MOOD_EMOJI = {
  happy: '😊',
  listening: '👂',
  thinking: '🤔',
  excited: '🎉',
  calm: '💜',
  sad: '😢'
}

export const EMOTION_BADGE_COLORS = {
  sad: '#FF6B6B',
  anxious: '#FF8C42',
  happy: '#6BCB77',
  pain: '#FF6B6B',
  angry: '#FF8C42',
  neutral: '#9898CC'
}
