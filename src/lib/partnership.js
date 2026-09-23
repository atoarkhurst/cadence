export function choosePartnership(members, userId) {
  const own = members.filter((member) => member.user_id === userId)
  const shared = (id) => members.some((member) => member.partnership_id === id && member.user_id !== userId)
  return [...own].sort((a, b) => Number(shared(b.partnership_id)) - Number(shared(a.partnership_id)) || a.partnership_id.localeCompare(b.partnership_id))[0] ?? null
}
export function isComplete(item) {
  return item.kind === 'count' ? item.count >= item.target : Boolean(item.done)
}
