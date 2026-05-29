import { useRef } from 'react'

export function useEmotionTracker() {
  const history = useRef([])

  function addEmotion(emotion) {
    history.current = [...history.current.slice(-1), emotion]
  }

  function shouldAlert() {
    const last2 = history.current
    return last2.length === 2 && last2.every((e) => e === 'sad' || e === 'anxious')
  }

  return { addEmotion, shouldAlert }
}
