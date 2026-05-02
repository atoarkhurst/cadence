// encodeURIComponent before btoa so non-ASCII characters (accented letters,
// emoji, etc.) don't cause btoa to throw a "character out of range" error.
export function encodeSnapshot(state) {
  return btoa(encodeURIComponent(JSON.stringify(state)))
}

// Returns the parsed object, or null if the string is missing, malformed
// base64, or contains invalid JSON.
export function decodeSnapshot(encoded) {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded)))
  } catch {
    return null
  }
}
