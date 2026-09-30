import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const handlers = {}, notices = [], navigations = []
const scope = 'https://atoarkhurst.github.io/cadence/'
const worker = {
  registration: { scope, showNotification: async (title, options) => notices.push({ title, ...options }) },
  addEventListener: (name, handler) => { handlers[name] = handler },
  clients: { matchAll: async () => [], openWindow: async url => navigations.push(url) },
}
vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'), { self: worker, URL })
const dispatch = async (type, extra = {}) => {
  let promise
  handlers[type]({ ...extra, waitUntil: work => { promise = work } })
  await promise
}
const id = '00000000-0000-4000-8000-000000000001'
await dispatch('push', { data: { json: () => ({ id, message: 'Must not appear', url: 'https://evil.test' }) } })
assert.equal(notices[0].data.url,`${scope}encouragement?message=${id}`)
assert.equal(notices[0].tag,`cadence-${id}`)
assert.equal(notices[0].renotify,false)
assert.ok(!JSON.stringify(notices).includes('Must not appear'))
await dispatch('push', { data: { json: () => { throw new Error('Malformed') } } })
assert.equal(notices[1].data.url,`${scope}encouragement`)
await dispatch('notificationclick', { notification: { close() {}, data: { url: 'https://evil.test' } } })
assert.equal(navigations[0],`${scope}encouragement`)
assert.equal(handlers.fetch,undefined,'private account data is not cached')
console.log('PASS: generic push payload, stable deduplication tag, safe tap-through, malformed payload fallback, no private cache.')
