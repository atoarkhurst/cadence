/* Push only: deliberately no fetch cache or offline writes for private account data. */
self.addEventListener('push', (event) => {
  let id = ''
  try { id = event.data?.json()?.id || '' } catch { /* Show a generic notification. */ }
  if (!/^[a-f0-9-]{36}$/i.test(id)) id = ''
  const base = self.registration.scope
  event.waitUntil(self.registration.showNotification('A little encouragement', {
    body: 'Your partner left you a note in Cadence.',
    icon: new URL('cadence-icon-192.png', base).href,
    tag: id ? `cadence-${id}` : 'cadence-encouragement',
    renotify: false,
    data: { url: new URL('encouragement' + (id ? `?message=${id}` : ''), base).href },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const base = self.registration.scope
  const target = new URL(event.notification.data?.url || 'encouragement', base)
  // Never navigate to a URL outside this app's scope.
  const url = target.href.startsWith(base) ? target.href : new URL('encouragement', base).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = windows.find(window => window.url.startsWith(base))
    if (client) { await client.navigate(url); await client.focus() }
    else { await self.clients.openWindow(url) }
  })())
})
