export function allowedEndpoint(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
      (url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com' || /^[a-z0-9-]+\.push\.apple\.com$/.test(url.hostname))
  } catch { return false }
}
export function retryableStatus(status) { return status === 429 || status >= 500 }
