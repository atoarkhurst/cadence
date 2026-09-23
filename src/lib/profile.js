export function cleanDisplayName(value) {
  const name = value.trim().replace(/\s+/g, ' ')
  if (!name || name.length > 60) throw new Error('Enter a name between 1 and 60 characters.')
  return name
}
