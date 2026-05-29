import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function Login({ onLogin }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const stars = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        dur: `${2 + Math.random() * 3}s`,
        delay: `${Math.random() * 4}s`
      })),
    []
  )

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })

      if (loginError) {
        setError(loginError.message)
        setLoading(false)
        return
      }

      if (data.user?.user_metadata?.role === 'child') {
        await supabase.auth.signOut()
        setError('This is a child account. Please use the child sign-in.')
        setLoading(false)
        return
      }

      onLogin(data.user)
      navigate('/dashboard')
    } catch {
      setError('Unable to sign in right now. Please try again.')
    }

    setLoading(false)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4" style={{ background: '#0A0A1A' }}>
      {stars.map((s) => (
        <span key={s.id} className="star" style={{ top: s.top, left: s.left, '--dur': s.dur, '--delay': s.delay }} />
      ))}

      <div
        className="relative z-10"
        style={{
          background: '#1E1E3F',
          border: '1px solid #2E2E5E',
          borderRadius: '24px',
          padding: '40px 48px',
          maxWidth: '400px',
          width: '90%'
        }}
      >
        <div className="absolute right-6 top-6" style={{ color: '#E8E8FF' }}>
          EN
        </div>

        <div className="mb-3 text-center" style={{ fontSize: '48px' }}>
          🌟
        </div>
        <h1 className="mb-1 text-center text-3xl" style={{ color: '#E8E8FF' }}>
          Lumin — Staff Portal
        </h1>
        <p className="mb-6 text-center" style={{ color: '#9898CC' }}>
          Sign in to access the caregiver dashboard
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm" style={{ color: '#E8E8FF' }}>
              Email address
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@hospital.com"
              style={{
                width: '100%',
                background: '#12122A',
                border: '1px solid #2E2E5E',
                color: '#E8E8FF',
                borderRadius: '10px',
                padding: '12px 16px',
                fontFamily: 'Nunito, sans-serif'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#6BCB77'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#2E2E5E'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLogin()
              }}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm" style={{ color: '#E8E8FF' }}>
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  background: '#12122A',
                  border: '1px solid #2E2E5E',
                  color: '#E8E8FF',
                  borderRadius: '10px',
                  padding: '12px 44px 12px 16px',
                  fontFamily: 'Nunito, sans-serif'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#6BCB77'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#2E2E5E'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLogin()
                }}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ background: 'transparent', border: 'none', color: '#9898CC', cursor: 'pointer' }}
                onClick={() => setShowPassword((p) => !p)}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ color: '#FF6B6B', fontSize: '14px' }}>
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '14px',
              background: '#6BCB77',
              color: '#0A0A1A',
              fontWeight: 700,
              fontSize: '16px',
              fontFamily: 'Fredoka One, cursive',
              border: 'none',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>

        <div className="my-4 h-px" style={{ background: '#2E2E5E' }} />
        <p className="text-center text-[13px]" style={{ color: '#9898CC' }}>
          Looking for the child interface?{' '}
          <Link to="/" style={{ color: '#E8E8FF' }}>
            → Go to Lumin ✨
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Login
