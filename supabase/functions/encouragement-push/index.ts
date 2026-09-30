import { createClient } from 'npm:@supabase/supabase-js@2.117.0'
import webpush from 'npm:web-push@3.6.7'
import { allowedEndpoint, retryableStatus } from './rules.mjs'

// Only public configuration is returned to signed-in browsers. Dispatch requires
// a separate server secret; the service-role key never crosses into the browser.
const origin = Deno.env.get('APP_ORIGIN') || 'https://atoarkhurst.github.io'
const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
type Job = { id: string; lease_id: string; notification_id: string; subscription_id: string; attempts: number }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)
  const secret = Deno.env.get('PUSH_DISPATCH_SECRET')
  const dispatch = !!secret && request.headers.get('x-dispatch-secret') === secret
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT')
  const enabled = Deno.env.get('PUSH_ENABLED') === 'true' && !!publicKey && !!privateKey && !!subject && !!secret
  if (!dispatch) {
    const token = request.headers.get('authorization')?.replace(/^Bearer /i, '')
    if (!token) return reply({ error: 'Sign in first' }, 401)
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) return reply({ error: 'Sign in first' }, 401)
    return reply({ enabled, publicKey: enabled ? publicKey : null })
  }
  if (!enabled) return reply({ error: 'Push is not enabled' }, 503)
  try {
    const { data: jobs, error } = await admin.rpc('claim_encouragement_push')
    if (error) throw error
    let handled = 0
    await Promise.all((jobs || []).map(async (job: Job) => {
      const finish = async (status: string, availableAt?: string) => {
        const { error } = await admin.from('encouragement_push_queue').update({ status,
          ...(availableAt ? { available_at: availableAt } : { finished_at: new Date().toISOString() })
        }).eq('id', job.id).eq('lease_id', job.lease_id)
        if (error) throw error
      }
      try {
        // Recheck consent, unread state and BOTH members immediately before sending.
        const n = await admin.from('encouragement_notifications').select('*').eq('id', job.notification_id).maybeSingle()
        const s = await admin.from('push_subscriptions').select('*').eq('id', job.subscription_id).maybeSingle()
        if (n.error || s.error) throw new Error('Read failed')
        const note = n.data, subscription = s.data
        if (!note || !subscription || subscription.user_id !== note.recipient_id || note.read_at || Date.now() - Date.parse(note.created_at) > 3600000) { await finish('skipped'); return }
        const p = await admin.from('partnerships').select('disconnected_at').eq('id', note.partnership_id).maybeSingle()
        const m = await admin.from('partnership_members').select('user_id').eq('partnership_id', note.partnership_id)
        if (p.error || m.error) throw new Error('Membership check failed')
        if (!p.data || p.data.disconnected_at || ![note.recipient_id, note.sender_id].every(id => m.data.some(member => member.user_id === id))) { await finish('skipped'); return }
        if (!allowedEndpoint(subscription.endpoint)) { await finish('failed'); return }
        // Generic payload: no goal titles, email addresses, or private message text.
        const details = webpush.generateRequestDetails({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ id: note.id }), {
          TTL: 300, urgency: 'normal', vapidDetails: { subject, publicKey, privateKey },
        })
        const response = await fetch(details.endpoint, { method: 'POST', headers: details.headers,
          body: details.body, redirect: 'error', signal: AbortSignal.timeout(10000) })
        if (response.status === 404 || response.status === 410) {
          const { error } = await admin.from('push_subscriptions').delete().eq('id', subscription.id)
          if (error) throw error
        } else if (response.ok) { await finish('sent') }
        else if (retryableStatus(response.status)) { throw new Error('Temporary push failure') }
        else { await finish('failed') }
        handled++
      } catch {
        await finish(job.attempts >= 5 ? 'failed' : 'pending', job.attempts < 5 ? new Date(Date.now() + Math.min(15, 2 ** job.attempts) * 60000).toISOString() : undefined)
      }
    }))
    return reply({ handled })
  } catch {
    // Never log subscription URLs, keys or message content.
    return reply({ error: 'Delivery temporarily unavailable' }, 503)
  }
})
