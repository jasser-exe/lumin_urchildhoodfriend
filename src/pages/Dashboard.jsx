import { useEffect, useMemo, useState } from 'react'
import ChildCard from '../components/ChildCard'
import { supabase } from '../lib/supabase'

function Dashboard({ user, onLogout }) {
  const [sessions, setSessions] = useState([])
  const [alerts, setAlerts] = useState([])
  const [emotionLogs, setEmotionLogs] = useState({})
  const [activities, setActivities] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [generatedCode, setGeneratedCode] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [codeError, setCodeError] = useState(null)

  useEffect(() => {
    // Auto-fetch or create a caregiver code when a staff user is available
    async function fetchOrCreateCode() {
      if (!user) return
      try {
        const userId = user.id
        if (!userId) return

        const { data: existing, error: selErr } = await supabase
          .from('caregiver_codes')
          .select('*')
          .eq('caregiver_id', userId)
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (selErr && selErr.code !== 'PGRST116') {
          // PGRST116 may mean no rows returned for single(); ignore
          console.error('Error fetching caregiver code', selErr)
        }

        if (existing && existing.code) {
          setGeneratedCode(existing.code)
          return
        }

        // create one
        const code = `DR-${Math.floor(1000 + Math.random() * 9000)}`
        const { data: ins, error: insErr } = await supabase
          .from('caregiver_codes')
          .insert({ code, caregiver_id: userId, active: true })
          .select()
          .single()

        if (insErr) {
          console.error('Error inserting caregiver code', insErr)
          setCodeError(insErr.message || String(insErr))
          return
        }

        setGeneratedCode(ins.code)
      } catch (err) {
        console.error('fetchOrCreateCode error', err)
        setCodeError(err?.message || String(err))
      }
    }

    fetchOrCreateCode()
  }, [user])

  async function fetchAssignedChildIds() {
    try {
      const { data } = await supabase
        .from('caregiver_patients')
        .select('child_id')
        .eq('caregiver_id', user.id)
        .eq('active', true)

      const ids = (data || []).map((row) => row.child_id).filter(Boolean)
      return ids
    } catch {
      // Fallback for older DB setups without caregiver assignment table.
      return null
    }
  }

  async function fetchData() {
    try {
      const assignedChildIds = await fetchAssignedChildIds()

      let sessionsQuery = supabase.from('sessions').select('*').order('last_active', { ascending: false })
      let alertsQuery = supabase
        .from('alerts')
        .select('*')
        .eq('acknowledged', false)
        .order('created_at', { ascending: false })

      if (Array.isArray(assignedChildIds)) {
        if (assignedChildIds.length === 0) {
          setSessions([])
          setAlerts([])
          setEmotionLogs({})
          setActivities({})
          setLastRefresh(new Date())
          setLoading(false)
          return
        }

        sessionsQuery = sessionsQuery.in('child_id', assignedChildIds)
        alertsQuery = alertsQuery.in('child_id', assignedChildIds)
      }

      const { data: s } = await sessionsQuery
      const { data: a } = await alertsQuery

      const sessionsData = s || []
      const alertsData = a || []

      setSessions(sessionsData)
      setAlerts(alertsData)

      const emotionMap = {}
      const activityMap = {}

      await Promise.all(
        sessionsData.map(async (session) => {
          const childKey = session.child_id || session.child_name

          let logsQuery = supabase.from('emotion_logs').select('*').order('logged_at', { ascending: false }).limit(5)
          let actsQuery = supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(5)

          if (session.child_id) {
            logsQuery = logsQuery.eq('child_id', session.child_id)
            actsQuery = actsQuery.eq('child_id', session.child_id)
          } else {
            logsQuery = logsQuery.eq('child_name', session.child_name)
            actsQuery = actsQuery.eq('child_name', session.child_name)
          }

          const [{ data: logs }, { data: acts }] = await Promise.all([logsQuery, actsQuery])

          emotionMap[childKey] = logs || []
          activityMap[childKey] = acts || []
        })
      )

      setEmotionLogs(emotionMap)
      setActivities(activityMap)
      setLastRefresh(new Date())
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 10000)
    return () => clearInterval(timer)
  }, [])

  async function acknowledgeAlert(alertId) {
    try {
      await supabase.from('alerts').update({ acknowledged: true }).eq('id', alertId)
      setAlerts((prev) => prev.filter((a) => a.id !== alertId))
    } catch {
      // Silent fail
    }
  }

  const activeChildren = useMemo(
    () => sessions.filter((s) => (Date.now() - new Date(s.last_active).getTime()) / 60000 < 30).length,
    [sessions]
  )
  const totalMessages = useMemo(() => sessions.reduce((sum, s) => sum + (s.messages_count || 0), 0), [sessions])
  const totalPoints = useMemo(() => sessions.reduce((sum, s) => sum + (s.score || 0), 0), [sessions])
  const alertCount = alerts.length

  const statCards = [
    { icon: '👶', value: activeChildren, label: 'Active Children', subtitle: 'last 30 min' },
    {
      icon: '⚠️',
      value: alertCount,
      label: 'Active Alerts',
      subtitle: 'unacknowledged',
      highlight: alertCount > 0
    },
    { icon: '💬', value: totalMessages, label: 'Total Messages', subtitle: 'all sessions' },
    { icon: '⭐', value: totalPoints, label: 'Total Points', subtitle: 'across all children' }
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A1A', color: '#E8E8FF' }}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4" style={{ background: '#12122A', borderColor: '#2E2E5E' }}>
        <div style={{ fontFamily: 'Fredoka One, cursive', fontSize: '1.5rem' }}>🌟 Lumin — Staff Dashboard</div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {alertCount > 0 && (
            <span className="rounded-full border px-3 py-1" style={{ borderColor: '#FF6B6B', color: '#FF6B6B', background: '#3a0a0a' }}>
              {alertCount} alerts
            </span>
          )}
          <span style={{ color: '#9898CC', fontSize: '12px' }}>Last updated: {lastRefresh.toLocaleTimeString()}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#9898CC', fontSize: '13px' }}>{user?.email}</span>
            {generatedCode && (
              <span className="rounded-full border px-3 py-1" style={{ borderColor: '#6BCB77', color: '#6BCB77', background: 'rgba(107,203,119,0.06)' }}>
                {generatedCode}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await onLogout()
              } catch {}
            }}
            style={{
              background: 'transparent',
              border: '1px solid #2E2E5E',
              color: '#9898CC',
              borderRadius: '10px',
              padding: '6px 14px',
              cursor: 'pointer'
            }}
          >
            Sign out →
          </button>

          <button
            type="button"
            onClick={async () => {
              setGenerating(true)
              setCodeError(null)
              setGeneratedCode(null)
              try {
                let userId = user?.id || null
                if (!userId) {
                  const res = await supabase.auth.getUser()
                  userId = res?.data?.user?.id || null
                }
                if (!userId) throw new Error('Utilisateur introuvable. Connectez-vous en tant que soignant.')
                const code = `DR-${Math.floor(1000 + Math.random() * 9000)}`
                const { data, error } = await supabase
                  .from('caregiver_codes')
                  .insert({ code, caregiver_id: userId, active: true })
                  .select()
                  .single()

                if (error) throw error
                setGeneratedCode(data.code)
              } catch (err) {
                console.error('Failed to generate caregiver code', err)
                setCodeError(err?.message || String(err))
              } finally {
                setGenerating(false)
              }
            }}
            disabled={generating}
            className="ml-2"
            style={{
              background: generating ? '#3a3a3a' : '#6BCB77',
              color: '#0A0A1A',
              border: 'none',
              borderRadius: '10px',
              padding: '6px 12px',
              cursor: generating ? 'not-allowed' : 'pointer'
            }}
            title="Generate caregiver code"
          >
            {generating ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 50 50" aria-hidden="true">
                  <circle cx="25" cy="25" r="18" stroke="#6BCB77" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="28 40">
                    <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
                  </circle>
                </svg>
                Generating…
              </span>
              ) : (
              'Generate caregiver code'
            )}
          </button>
        </div>
      </header>

      {(generatedCode || codeError) && (
        <div className="mx-auto mt-4 w-full max-w-[1400px] px-6">
          <div className="rounded-[12px] border p-4" style={{ background: '#1E1E3F', borderColor: '#2E2E5E' }}>
            <div style={{ color: '#FFD93D', fontWeight: 800 }}>Caregiver code generated</div>
            <div className="mt-2 flex items-center gap-3">
              {generating ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 50 50" aria-hidden="true">
                    <circle cx="25" cy="25" r="18" stroke="#6BCB77" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="28 40">
                      <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
                    </circle>
                  </svg>
                  <div style={{ color: '#E8E8FF', fontSize: '15px' }}>Generating code…</div>
                </div>
              ) : (
                <div style={{ color: '#E8E8FF', fontFamily: 'monospace', fontSize: '18px' }}>{generatedCode || '—'}</div>
              )}
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(generatedCode)
                  } catch {}
                }}
                className="rounded-full border px-3 py-1 text-xs"
                style={{ borderColor: '#6BCB77', color: '#6BCB77', background: 'transparent', cursor: 'pointer' }}
              >
                Copy
              </button>
            </div>
            {codeError && <div style={{ color: '#FF6B6B', marginTop: '8px' }}>Error: {codeError}</div>}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1400px] px-6 py-6">
        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-[18px] border p-5 text-center"
              style={{ background: '#1E1E3F', borderColor: '#2E2E5E' }}
            >
              <div style={{ fontSize: '2rem' }}>{card.icon}</div>
              <div style={{ fontFamily: 'Fredoka One, cursive', fontSize: '2.2rem', color: card.highlight ? '#FF6B6B' : '#FFD93D' }}>
                {card.value}
              </div>
              <div style={{ fontSize: '14px', color: '#E8E8FF', fontWeight: 600 }}>{card.label}</div>
              <div style={{ fontSize: '12px', color: '#9898CC' }}>{card.subtitle}</div>
            </div>
          ))}
        </section>

        <div className="mb-4 flex items-center gap-3">
          <h2 style={{ fontFamily: 'Fredoka One, cursive', fontSize: '1.2rem' }}>Active Sessions</h2>
          <span className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: '#2E2E5E', color: '#9898CC' }}>
            Auto-refreshing every 10s
          </span>
        </div>

        {loading && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="h-56 animate-pulse rounded-[18px] border"
                style={{ background: 'rgba(30,30,63,0.5)', borderColor: '#2E2E5E' }}
              />
            ))}
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="py-20 text-center">
            <div style={{ fontSize: '4rem' }}>🌙</div>
            <div style={{ fontFamily: 'Fredoka One, cursive', fontSize: '1.5rem' }}>No active sessions</div>
            <div style={{ color: '#9898CC' }}>Children will appear here once they start a conversation.</div>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
            {sessions.map((session) => (
              <ChildCard
                key={session.id}
                session={session}
                alerts={alerts.filter((a) => (session.child_id ? a.child_id === session.child_id : a.child_name === session.child_name))}
                emotionLogs={emotionLogs[session.child_id || session.child_name] || []}
                activities={activities[session.child_id || session.child_name] || []}
                onAcknowledge={acknowledgeAlert}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default Dashboard
