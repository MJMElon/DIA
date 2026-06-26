import React, { useEffect, useState } from 'react'
import { supabase, supabaseReady } from './lib/supabase'
import Auth from './components/Auth.jsx'
import Counter from './components/Counter.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!supabaseReady) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  return (
    <div className="wrap">
      <header>
        <div className="brand">
          <span className="logo">MJM<span className="leaf">AI</span></span>
          <div className="brandtext">
            <h1>DIA</h1>
            <span className="tag">Drone Imagery Analysis</span>
          </div>
          <div className="spacer" />
          {session && (
            <div className="userbox">
              <span>{session.user.email}</span>
              <button className="linkbtn" onClick={signOut}>sign out</button>
            </div>
          )}
        </div>
        <p>Count oil palms or nursery polybags from a drone map. Your Gemini key stays
          server-side in a Supabase Edge Function — it is never shipped to the browser.</p>
      </header>

      {!supabaseReady
        ? <NotConfigured />
        : !ready
          ? <p className="status">Loading…</p>
          : !session
            ? <Auth />
            : <Counter session={session} />}
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="authwrap">
      <div className="authcard">
        <h2>Supabase not configured</h2>
        <p>This build has no Supabase credentials, so it can't sign you in or reach the
          counting function.</p>
        <div className="notice warn">
          Create <code>.env.local</code> from <code>.env.example</code> and set
          <code> VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart
          the dev server. See <code>AI-SETUP.md</code>.
        </div>
      </div>
    </div>
  )
}
