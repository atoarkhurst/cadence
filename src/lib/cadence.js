import { supabase } from './supabase.js'

function mondayISO() {
  const date = new Date()
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

export async function loadCurrentWeek() {
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return { signedOut: true }

  let { data: membership, error } = await supabase.from('partnership_members').select('partnership_id, joined_at').order('joined_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  if (!membership) {
    const { data: partnership, error: partnershipError } = await supabase.from('partnerships').insert({ created_by: user.id }).select('id').single()
    if (partnershipError) throw partnershipError
    const { error: memberError } = await supabase.from('partnership_members').insert({ partnership_id: partnership.id, user_id: user.id })
    if (memberError) throw memberError
    membership = { partnership_id: partnership.id }
  }

  const { data: week, error: weekError } = await supabase.from('weeks').upsert({ partnership_id: membership.partnership_id, starts_on: mondayISO() }, { onConflict: 'partnership_id,starts_on', ignoreDuplicates: true }).select('id').maybeSingle()
  if (weekError) throw weekError
  let weekId = week?.id
  if (!weekId) {
    const { data: existing, error: existingError } = await supabase.from('weeks').select('id').eq('partnership_id', membership.partnership_id).eq('starts_on', mondayISO()).single()
    if (existingError) throw existingError
    weekId = existing.id
  }

  const { data: intentions, error: intentionError } = await supabase.from('intentions').select('*, progress_entries(value)').eq('week_id', weekId).order('sort_order')
  if (intentionError) throw intentionError
  const shaped = intentions.map((item) => ({ id: item.id, ownerId: item.owner_id, name: item.title, target: item.target, count: item.progress_entries.reduce((sum, entry) => sum + entry.value, 0), done: item.progress_entries.some((entry) => entry.value > 0), kind: item.kind }))
  const { data: members, error: memberError } = await supabase.from('partnership_members').select('user_id').eq('partnership_id', membership.partnership_id)
  if (memberError) throw memberError
  const memberIds = members.map((item) => item.user_id)
  const { data: profiles, error: profileError } = await supabase.from('profiles').select('id, display_name').in('id', memberIds)
  if (profileError) throw profileError
  const partner = profiles.find((profile) => profile.id !== user.id) ?? null
  const { data: encouragements, error: cheerError } = await supabase.from('encouragements').select('*').eq('week_id', weekId).order('created_at', { ascending: false })
  if (cheerError) throw cheerError
  const profileMap = Object.fromEntries(profiles.map((profile) => [profile.id, profile.display_name]))
  const own = shaped.filter((item) => item.ownerId === user.id)
  const partnerItems = partner ? shaped.filter((item) => item.ownerId === partner.id) : []
  return { user, weekId, partnershipId: membership.partnership_id, partner, partnerItems, cheers: encouragements.map((item) => ({ ...item, author: profileMap[item.author_id] ?? 'Partner' })), tasks: own.filter((item) => item.kind === 'one_time'), goals: own.filter((item) => item.kind === 'count') }
}

export async function createInvitation(partnershipId, userId, email) {
  const { data, error } = await supabase.from('invitations').insert({ partnership_id: partnershipId, invited_by: userId, email: email.trim().toLowerCase() }).select('token').single()
  if (error) throw error
  return data.token
}

export async function acceptInvitation(token) {
  const { data, error } = await supabase.rpc('accept_invitation', { invitation_token: token })
  if (error) throw error
  return data
}

export async function createIntention(weekId, userId, title, kind, target = null) {
  const { data, error } = await supabase.from('intentions').insert({ week_id: weekId, owner_id: userId, title, kind, target }).select('id').single()
  if (error) throw error
  return data.id
}

export async function setProgress(intentionId, userId, value) {
  const today = new Date().toISOString().slice(0, 10)
  const { data: previous, error: readError } = await supabase.from('progress_entries').select('value').eq('intention_id', intentionId).eq('user_id', userId).neq('recorded_on', today)
  if (readError) throw readError
  const previousTotal = previous.reduce((sum, entry) => sum + entry.value, 0)
  const { error } = await supabase.from('progress_entries').upsert({ intention_id: intentionId, user_id: userId, value: Math.max(0, value - previousTotal), recorded_on: today }, { onConflict: 'intention_id,user_id,recorded_on' })
  if (error) throw error
}

export async function removeIntention(id) {
  const { error } = await supabase.from('intentions').delete().eq('id', id)
  if (error) throw error
}

export async function createEncouragement(weekId, userId, message) {
  const { data, error } = await supabase.from('encouragements').insert({ week_id: weekId, author_id: userId, message }).select('*').single()
  if (error) throw error
  return data
}

export async function loadDailyRhythm() {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { signedOut: true }
  const today = new Date().toISOString().slice(0, 10)
  const { data: items, error } = await supabase.from('daily_items').select('*, daily_completions(completed_on)').eq('user_id', auth.user.id).eq('active', true).order('sort_order')
  if (error) throw error
  return { user: auth.user, items: items.map((item) => ({ id: item.id, name: item.title, done: item.daily_completions.some((entry) => entry.completed_on === today) })) }
}

export async function createDailyItem(userId, title) {
  const { data, error } = await supabase.from('daily_items').insert({ user_id: userId, title }).select('id').single()
  if (error) throw error
  return data.id
}

export async function setDailyCompletion(itemId, userId, done) {
  const completedOn = new Date().toISOString().slice(0, 10)
  const query = supabase.from('daily_completions')
  const { error } = done ? await query.upsert({ item_id: itemId, user_id: userId, completed_on: completedOn }) : await query.delete().eq('item_id', itemId).eq('user_id', userId).eq('completed_on', completedOn)
  if (error) throw error
}

export async function removeDailyItem(id) {
  const { error } = await supabase.from('daily_items').delete().eq('id', id)
  if (error) throw error
}
