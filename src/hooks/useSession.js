import { useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useSession() {
  const sessionId = useRef(null)

  const createSession = useCallback(async (childName, childId = null) => {
    try {
      const now = new Date().toISOString()
      const { data } = await supabase
        .from('sessions')
        .insert({
          child_id: childId,
          child_name: childName,
          started_at: now,
          last_active: now,
          messages_count: 0,
          current_emotion: 'neutral',
          current_mood: 'happy',
          score: 0,
          story_episode: 0
        })
        .select('id')
        .single()

      sessionId.current = data?.id ?? null
    } catch {
      // Silent fail
    }
  }, [])

  const updateSession = useCallback(async (fields) => {
    if (!sessionId.current) return

    try {
      await supabase
        .from('sessions')
        .update({
          ...fields,
          last_active: new Date().toISOString()
        })
        .eq('id', sessionId.current)
    } catch {
      // Silent fail
    }
  }, [])

  const logEmotion = useCallback(async (childName, childId, emotion, messagePreview) => {
    try {
      await supabase.from('emotion_logs').insert({
        child_id: childId,
        child_name: childName,
        emotion,
        message_preview: (messagePreview || '').slice(0, 100),
        logged_at: new Date().toISOString()
      })
    } catch {
      // Silent fail
    }
  }, [])

  const logActivity = useCallback(async (childName, childId, activityType, detail) => {
    try {
      await supabase.from('activities').insert({
        child_id: childId,
        child_name: childName,
        activity_type: activityType,
        detail,
        created_at: new Date().toISOString()
      })
    } catch {
      // Silent fail
    }
  }, [])

  const logAlert = useCallback(async (childName, childId, reason) => {
    try {
      await supabase.from('alerts').insert({
        child_id: childId,
        child_name: childName,
        reason,
        acknowledged: false,
        created_at: new Date().toISOString()
      })
    } catch {
      // Silent fail
    }
  }, [])

  return {
    sessionId,
    createSession,
    updateSession,
    logEmotion,
    logActivity,
    logAlert
  }
}
