// encodeURIComponent before btoa so non-ASCII characters (accented letters,
// emoji, etc.) don't cause btoa to throw a "character out of range" error.
export function encodeSnapshot(state) {
  return btoa(encodeURIComponent(JSON.stringify(state)))
}

// Returns the parsed object, or null if the string is missing, malformed
// base64, or contains invalid JSON.
export function decodeSnapshot(encoded) {
  try {
    if (typeof encoded !== 'string' || encoded.length > 24000) return null
    const data = JSON.parse(decodeURIComponent(atob(encoded)))
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const text = (value) => typeof value === 'string' && value.length <= 160
    if (data.weekLabel !== undefined && !text(data.weekLabel)) return null
    for (const key of ['habits', 'checkedHabits']) {
      if (
        data[key] !== undefined &&
        (!Array.isArray(data[key]) || data[key].length > 100 || !data[key].every(text))
      )
        return null
    }
    const weekly = data.weeklyGoals ?? {}
    if (typeof weekly !== 'object' || Array.isArray(weekly) || data.weeklyGoals === null)
      return null
    for (const key of ['tasks', 'goals']) {
      const items = weekly[key] ?? []
      if (!Array.isArray(items) || items.length > 100 || weekly[key] === null) return null
      if (
        !items.every(
          (item) =>
            item &&
            text(item.name) &&
            (typeof item.id === 'string' || typeof item.id === 'number') &&
            (key === 'tasks'
              ? typeof item.done === 'boolean'
              : Number.isSafeInteger(item.count) &&
                item.count >= 0 &&
                Number.isSafeInteger(item.target) &&
                item.target > 0),
        )
      )
        return null
    }
    return data
  } catch {
    return null
  }
}
