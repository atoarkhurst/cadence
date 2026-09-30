import { supabase } from './supabase.js'
import { choosePartnership } from './partnership.js'
import { currentWeek, nextWeek, validWeek } from './weeks.js'

export async function loadCurrentWeek(startsOn = null) {
  if (startsOn && !validWeek(startsOn)) throw new Error('Choose a valid week.')
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return { signedOut: true }

  const { data: memberships, error } = await supabase.from('partnership_members').select('partnership_id, user_id, joined_at')
  if (error) throw error
  let membership = choosePartnership(memberships, user.id)
  if (!membership) {
    const { data: partnership, error: partnershipError } = await supabase.from('partnerships').insert({ created_by: user.id }).select('id').single()
    if (partnershipError) throw partnershipError
    const { error: memberError } = await supabase.from('partnership_members').insert({ partnership_id: partnership.id, user_id: user.id })
    if (memberError) throw memberError
    membership = { partnership_id: partnership.id }
  }

  const { data: schedule, error: scheduleError } = await supabase.from('week_schedules').select('*').eq('partnership_id', membership.partnership_id).maybeSingle()
  if (scheduleError && !['PGRST205', '42P01'].includes(scheduleError.code)) throw scheduleError
  const currentStartsOn = currentWeek(schedule)
  const { data: history, error: historyError } = await supabase.from('weeks').select('*').eq('partnership_id', membership.partnership_id).order('starts_on', { ascending: false })
  if (historyError) throw historyError
  startsOn ||= currentStartsOn
  let week = history.find(item => item.starts_on === startsOn) || history.find(item => item.original_starts_on === startsOn)
  if (!week) {
    const day = schedule && startsOn >= schedule.effective_on ? schedule.start_day : schedule?.previous_day ?? 1
    if (!validWeek(startsOn, day)) throw new Error('The shared week schedule has changed. Open This week to see your current plan.')
    const result = await supabase.from('weeks').upsert({ partnership_id: membership.partnership_id, starts_on: startsOn }, { onConflict: 'partnership_id,starts_on', ignoreDuplicates: true }).select('*').maybeSingle()
    if (result.error) throw result.error
    week = result.data
    if (!week) {
      const existing = await supabase.from('weeks').select('*').eq('partnership_id', membership.partnership_id).eq('starts_on', startsOn).single()
      if (existing.error) throw existing.error
      week = existing.data
    }
  }
  startsOn = week.starts_on
  const weekId = week.id
  const nextStartsOn = history.find(item => item.id === week.next_week_id)?.starts_on || nextWeek(startsOn)
  const previousStartsOn = history.find(item => item.starts_on < currentStartsOn)?.starts_on

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
  return { user, weekId, startsOn, currentStartsOn, nextStartsOn, previousStartsOn, schedule, displayName: profileMap[user.id] || 'You', partnershipId: membership.partnership_id, partner, partnerItems, cheers: encouragements.map((item) => ({ ...item, author: profileMap[item.author_id] ?? 'Partner' })), tasks: own.filter((item) => item.kind === 'one_time'), goals: own.filter((item) => item.kind === 'count') }
}

export async function createInvitation(partnershipId, userId, email) {
  const { data: { user } } = await supabase.auth.getUser()
  if (email.trim().toLowerCase() === user?.email?.toLowerCase()) throw new Error('Enter your partner’s email, rather than your own.')
  const { data: pending, error: pendingError } = await supabase.from('invitations').select('token, email, expires_at').eq('partnership_id', partnershipId).eq('invited_by', userId).eq('email', email.trim().toLowerCase()).is('accepted_at', null).gt('expires_at', new Date().toISOString()).limit(1).maybeSingle()
  if (pendingError) throw pendingError
  if (pending) return pending
  const { data, error } = await supabase.from('invitations').insert({ partnership_id: partnershipId, invited_by: userId, email: email.trim().toLowerCase() }).select('token, email, expires_at').single()
  if (error) throw error
  return data
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
