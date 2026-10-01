import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { currentPush, disablePush, enablePush, preparePush, pushSupport } from './lib/push.js'

export default function NotificationSettings({ userId }) {
  const [support] = useState(pushSupport)
  const [config, setConfig] = useState(null)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [denied, setDenied] = useState(
    () => 'Notification' in window && Notification.permission === 'denied',
  )
  useEffect(() => {
    let active = true
    if (support !== 'supported') return
    const load = async () => {
      const subscription = await currentPush()
      if (subscription) {
        const { data, error } = await supabase
          .from('push_subscriptions')
          .select('id')
          .eq('endpoint', subscription.endpoint)
          .eq('user_id', userId)
          .maybeSingle()
        if (active) setOn(!error && !!data && Notification.permission === 'granted')
      }
      const ready = await preparePush()
      if (active) setConfig(ready)
    }
    void load().catch(() => {
      if (active) setConfig({ enabled: false })
    })
    return () => {
      active = false
    }
  }, [support, userId])
  async function toggle() {
    // Request directly in the tap handler, before awaiting any network operation.
    const permission = !on ? Notification.requestPermission() : null
    setBusy(true)
    setMessage('')
    try {
      if (on) {
        await disablePush()
        setOn(false)
        setMessage('Notifications are off on this device. Your notes stay in Cadence.')
      } else {
        await enablePush(config, userId, permission)
        setOn(true)
        setMessage('You’ll be notified about new encouragement on this device.')
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
      setDenied(Notification.permission === 'denied')
    }
  }
  return (
    <section
      className="notification-settings"
      id="notifications"
      aria-labelledby="notification-heading"
    >
      <h2 id="notification-heading">A little encouragement, wherever you are.</h2>
      <p>
        Optional notifications when your partner sends a note. No goal-by-goal alerts, and no
        private message text on your lock screen.
      </p>
      {support === 'install' && (
        <div className="install-instructions">
          <strong>On iPhone or iPad</strong>
          <p>
            Open Cadence in Safari. Tap Share → Add to Home Screen (it may be under More). Open the
            Cadence icon, sign in if asked, then return to Account to enable notifications.
          </p>
        </div>
      )}
      {support === 'unsupported' && (
        <p>
          This browser doesn’t support push notifications. You can still read every note inside
          Cadence.
        </p>
      )}
      {support === 'supported' && (
        <>
          {denied && (
            <p>
              Notifications are blocked in your browser or device settings. Allow them there, then
              reload Cadence to enable them here.
            </p>
          )}
          {!config && <p role="status">Checking notification availability…</p>}
          {config && !config.enabled && (
            <p>
              Phone notifications aren’t available yet. Encouragement still works inside Cadence.
            </p>
          )}
          {(on || config?.enabled) && (
            <button
              type="button"
              className="auth-secondary"
              disabled={busy || (!on && denied)}
              onClick={toggle}
            >
              {busy ? 'Updating…' : on ? 'Turn off on this device' : 'Enable on this device'}
            </button>
          )}
          {on && (
            <small>
              On for this device. Signing out turns them off here. Delivery depends on your
              connection and device notification settings.
            </small>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
