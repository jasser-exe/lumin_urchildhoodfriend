import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import LuminCharacter from '../components/LuminCharacter'

function Welcome() {
  const navigate = useNavigate()

  const stars = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        dur: `${2 + Math.random() * 3}s`,
        delay: `${Math.random() * 4}s`
      })),
    []
  )

  function handleStart() {
    navigate('/kid-login')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4" style={{ background: '#0A0A1A' }}>
      {stars.map((s) => (
        <span key={s.id} className="star" style={{ top: s.top, left: s.left, '--dur': s.dur, '--delay': s.delay }} />
      ))}

      <div className="relative z-10 w-full max-w-[420px]">
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
          <h1 className="mb-2 text-center" style={{ fontSize: '2rem', color: '#FFD93D' }}>
            Hello! I'm Lumin ✨
          </h1>
          <p className="mb-6 text-center" style={{ color: '#9898CC' }}>
            Your magic friend at the hospital
          </p>

          <div
            className="mb-4 rounded-[12px] border p-3 text-sm"
            style={{ borderColor: '#2E2E5E', background: '#12122A', color: '#9898CC' }}
          >
            Sign in with your child account so Lumin can remember you.
          </div>

          <button
            type="button"
            onClick={handleStart}
            className="w-full"
            style={{
              background: '#6BCB77',
              color: '#0A0A1A',
              fontWeight: 700,
              borderRadius: '14px',
              fontFamily: 'Fredoka One, cursive',
              border: 'none',
              padding: '13px 16px',
              cursor: 'pointer'
            }}
          >
            Sign in / Create account 🚀
          </button>

          <div className="mt-4 text-center" style={{ color: '#9898CC', fontSize: '12px' }}>
            <Link to="/login" style={{ color: '#9898CC' }}>
              Caregiver? → Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Welcome
