import { supabase } from './supabase.js'
import { appPath } from './paths.js'

const ownerKey = 'cadence-push-account'
export function pushSupport() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  if (ios && !standalone) return 'install'
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'supported' : 'unsupported'
}
export async function preparePush() {
  const { data, error } = await supabase.functions.invoke('encouragement-push')
  if (error || !data?.enabled) return { enabled: false }
  const registration = await navigator.serviceWorker.register(appPath('/sw.js'), { scope: appPath('/') })
  await navigator.serviceWorker.ready
  return { ...data, registration }
}
export function applicationKey(value) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}
export async function enablePush(config, userId, permission) {
  if (await permission !== 'granted') throw new Error('Notifications weren’t enabled. You can keep using encouragement inside Cadence.')
  let subscription = await config.registration.pushManager.getSubscription()
  if (!subscription) subscription = await config.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(config.publicKey) })
  try {
    const saved = subscription.toJSON()
    const { error } = await supabase.rpc('register_push_subscription', { push_endpoint: saved.endpoint, push_key: saved.keys.p256dh, push_auth: saved.keys.auth })
    if (error) throw error
    localStorage.setItem(ownerKey, userId)
  } catch (error) {
    await subscription.unsubscribe()
    throw error
  }
}
export async function currentPush() {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration(appPath('/'))
  return registration ? registration.pushManager?.getSubscription() : null
}
export async function disablePush() {
  const subscription = await currentPush()
  if (!subscription) { localStorage.removeItem(ownerKey); return }
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  const unsubscribed = await subscription.unsubscribe()
  if (error && !unsubscribed) throw new Error('Couldn’t turn off notifications. Please try again before signing out.')
  localStorage.removeItem(ownerKey)
}
export async function reconcilePushAccount(userId) {
  const owner = localStorage.getItem(ownerKey)
  if (owner && owner !== userId) {
    const subscription = await currentPush()
    if (subscription) await subscription.unsubscribe()
    localStorage.removeItem(ownerKey)
  }
}
