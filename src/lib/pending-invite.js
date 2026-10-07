const key = 'cadence-pending-invite'

export function getPendingInvite() {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function rememberPendingInvite(token) {
  try {
    localStorage.setItem(key, token)
  } catch {
    // The invitation URL remains available when storage is disabled.
  }
}

export function clearPendingInvite(token = null) {
  try {
    if (token === null || localStorage.getItem(key) === token) localStorage.removeItem(key)
  } catch {
    // A successful server action must not fail because storage is unavailable.
  }
}
