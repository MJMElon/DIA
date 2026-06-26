import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

/* Email magic-link sign-in. No passwords to manage; Supabase emails a one-tap
   link. Only signed-in users can call the counting function, which is what
   protects your Gemini quota from strangers. */
export default function Auth() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function sendLink(e) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    setBusy(false)
    if (error) setErr(error.message); else setSent(true)
  }

  return (
    <div className="authwrap">
      <div className="authcard">
        <h2>Sign in to count</h2>
        <p>We email you a one-tap sign-in link. This keeps the Gemini quota for
          authorised users only.</p>
        {sent ? (
          <div className="notice">
            Check <b>{email}</b> for a sign-in link, then return here. You can close this tab.
          </div>
        ) : (
          <form onSubmit={sendLink}>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" autoComplete="email" required />
            </div>
            <button className="go" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
            {err && <div className="status" style={{ color: 'var(--ffb)' }}>{err}</div>}
          </form>
        )}
      </div>
    </div>
  )
}
