import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { acceptInvitation } from './lib/cadence.js'
import { supabase } from './lib/supabase.js'
import { appPath } from './lib/paths.js'
import './Auth.css'

function Invite() {
  const { token } = useParams()
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('Checking your invitation…')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        localStorage.setItem('cadence-pending-invite', token)
        setStatus('signed-out')
        setMessage('Sign in with the email address that received this invitation, then open this link again.')
        return
      }
      try {
        await acceptInvitation(token)
        localStorage.removeItem('cadence-pending-invite')
        setStatus('accepted')
        setMessage('You’re connected. Your shared week is ready.')
      } catch (error) {
        setStatus('error')
        setMessage(error.message)
      }
    })
  }, [token])

  return <main className="auth-shell"><section className="auth-card"><span className="auth-kicker">Partner invitation</span><h1>{status === 'accepted' ? 'Welcome to the cadence.' : 'Join a shared week.'}</h1><p>{message}</p>{status === 'signed-out' && <a className="auth-primary" href={appPath('/signin')}>Sign in to continue</a>}{status === 'accepted' && <a className="auth-primary" href={appPath('/week')}>Open your week</a>}</section></main>
}

export default Invite
