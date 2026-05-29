import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import Login from './pages/Login'
import KidLogin from './pages/KidLogin'
import Welcome from './pages/Welcome'
import Chat from './pages/Chat'
import Dashboard from './pages/Dashboard'
import { supabase } from './lib/supabase'

function isStaffUser(user) {
  if (!user) return false
  return user.user_metadata?.role !== 'child'
}

function App() {
  const [authUser, setAuthUser] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true

    async function restoreSession() {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession()
        if (mounted) {
          setAuthUser(session?.user ?? null)
        }
      } catch {
        if (mounted) {
          setAuthUser(null)
        }
      }
    }

    restoreSession()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleLogout() {
    try {
      await supabase.auth.signOut()
    } catch {
      // Silent fail
    }
    setAuthUser(null)
    navigate('/login')
  }

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={setAuthUser} />} />
      <Route path="/kid-login" element={<KidLogin />} />
      <Route path="/" element={<Welcome />} />
      <Route path="/chat" element={<Chat />} />
      <Route
        path="/dashboard"
        element={isStaffUser(authUser) ? <Dashboard user={authUser} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
      />
    </Routes>
  )
}

export default App
