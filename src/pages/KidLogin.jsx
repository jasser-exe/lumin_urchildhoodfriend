import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LuminCharacter from '../components/LuminCharacter'
import { supabase } from '../lib/supabase'

const CHILD_ACCOUNT_KEY = 'luminChildAccount'

function normalizeUsername(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9_.-]/g, '')
}

function toChildEmail(username) {
  return `${username}@kids.lumin.local`
}

function KidLogin() {
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [caregiverCode, setCaregiverCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const stars = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        dur: `${2 + Math.random() * 3}s`,
        delay: `${Math.random() * 4}s`
      })),
    []
  )

  async function handleSubmit() {
    const normalizedUsername = normalizeUsername(username)
    const trimmedDisplayName = displayName.trim()
    const normalizedCaregiverCode = caregiverCode.trim().toUpperCase()

    if (normalizedUsername.length < 3) {
      setError('Choose a username with at least 3 characters.')
      return
    }

    if (password.trim().length < 6) {
      setError('Choose a password with at least 6 characters.')
      return
    }

    if (isRegister && !trimmedDisplayName) {
      setError("Add your first name so Lumin can recognize you.")
      return
    }

    if (isRegister && normalizedCaregiverCode.length < 4) {
      setError('Enter the caregiver code provided by your doctor.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const email = toChildEmail(normalizedUsername)

      if (isRegister) {
        let caregiverId = null
        const { data: codeRow, error: codeError } = await supabase
          .from('caregiver_codes')
          .select('caregiver_id, active')
          .eq('code', normalizedCaregiverCode)
          .single()

        if (codeError || !codeRow?.active || !codeRow?.caregiver_id) {
          setError('Invalid caregiver code. Ask your doctor for the code.')
          setLoading(false)
          return
        }

        caregiverId = codeRow.caregiver_id

        try {
          const resp = await fetch('http://localhost:8000/admin/create-child', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: normalizedUsername,
              password,
              display_name: trimmedDisplayName,
              caregiver_code: normalizedCaregiverCode
            })
          })

          const json = await resp.json()
          if (!resp.ok || json?.error) {
            setError(typeof json?.error === 'string' ? json.error : JSON.stringify(json?.error || 'Error'))
            setLoading(false)
            return
          }
        } catch (err) {
          setError('Failed to create child account. Try again later.')
          setLoading(false)
          return
        }
      }

      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (loginError) {
        setError(loginError.message)
        setLoading(false)
        return
      }

      const user = loginData.user
      if (!user) {
        setError('Could not retrieve child profile.')
        setLoading(false)
        return
      }

      const account = {
        id: user.id,
        username: user.user_metadata?.username || normalizedUsername,
        displayName: user.user_metadata?.display_name || trimmedDisplayName || normalizedUsername
      }

      localStorage.setItem(CHILD_ACCOUNT_KEY, JSON.stringify(account))
      localStorage.setItem('childName', account.displayName)
      navigate('/chat')
    } catch {
      setError('Unable to sign in right now. Please try again shortly.')
    }

    setLoading(false)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4" style={{ background: '#0A0A1A' }}>
      {stars.map((s) => (
        <span key={s.id} className="star" style={{ top: s.top, left: s.left, '--dur': s.dur, '--delay': s.delay }} />
      ))}

      <div className="relative z-10 w-full max-w-[440px]">
        <div className="mb-5 flex justify-center">
          <LuminCharacter mood="happy" isSpeaking={false} isListening={false} />
        </div>

        <div
          className="relative"
          style={{
            background: '#1E1E3F',
            border: '1px solid #2E2E5E',
            borderRadius: '24px',
            padding: '40px 36px'
          }}
        >
          <h1 className="mb-1 text-center" style={{ fontSize: '2rem', color: '#FFD93D' }}>
            {isRegister ? 'Create your account' : 'Child sign in'}
          </h1>
          <p className="mb-6 text-center" style={{ color: '#9898CC' }}>
            {isRegister ? "Lumin will remember you on each visit ✨" : 'Return to your Lumin world'}
          </p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm" style={{ color: '#E8E8FF' }}>
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g.: leo123"
                style={{
                  width: '100%',
                  background: '#12122A',
                  border: '1px solid #2E2E5E',
                  color: '#E8E8FF',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  fontFamily: 'Nunito, sans-serif'
                }}
              />
            </div>

            {isRegister && (
              <div>
                <label className="mb-1 block text-sm" style={{ color: '#E8E8FF' }}>
                  Display name
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g.: Leo"
                  style={{
                    width: '100%',
                    background: '#12122A',
                    border: '1px solid #2E2E5E',
                    color: '#E8E8FF',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    fontFamily: 'Nunito, sans-serif'
                  }}
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm" style={{ color: '#E8E8FF' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="******"
                style={{
                  width: '100%',
                  background: '#12122A',
                  border: '1px solid #2E2E5E',
                  color: '#E8E8FF',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  fontFamily: 'Nunito, sans-serif'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit()
                }}
              />
            </div>

            {isRegister && (
              <div>
                <label className="mb-1 block text-sm" style={{ color: '#E8E8FF' }}>
                  Caregiver code
                </label>
                <input
                  value={caregiverCode}
                  onChange={(e) => setCaregiverCode(e.target.value.toUpperCase())}
                  placeholder="e.g.: DR-4821"
                  style={{
                    width: '100%',
                    background: '#12122A',
                    border: '1px solid #2E2E5E',
                    color: '#E8E8FF',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    fontFamily: 'Nunito, sans-serif'
                  }}
                />
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3" style={{ color: '#FF6B6B', fontSize: '14px' }}>
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="mt-4 w-full"
            style={{
              background: '#6BCB77',
              color: '#0A0A1A',
              fontWeight: 700,
              borderRadius: '14px',
              fontFamily: 'Fredoka One, cursive',
              border: 'none',
              padding: '13px 16px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'One moment...' : isRegister ? 'Create my account' : 'Sign in'}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsRegister((prev) => !prev)
              setError(null)
            }}
            className="mt-3 w-full"
            style={{
              background: 'transparent',
              color: '#9898CC',
              border: '1px solid #2E2E5E',
              borderRadius: '14px',
              padding: '10px 14px',
              cursor: 'pointer'
            }}
          >
            {isRegister ? 'I already have an account' : 'Create a new account'}
          </button>

          <div className="mt-4 text-center" style={{ color: '#9898CC', fontSize: '12px' }}>
            <Link to="/login" style={{ color: '#9898CC' }}>
              Caregiver? Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default KidLogin
