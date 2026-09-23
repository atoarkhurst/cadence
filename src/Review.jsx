import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { loadCurrentWeek } from './lib/cadence.js'
import { isComplete } from './lib/partnership.js'
import { mondayISO, nextWeek, validWeek, weekLabel } from './lib/weeks.js'
import { appPath } from './lib/paths.js'
import './Review.css'

function ProgressSummary({ name, items }) {
  return <section className="review-card"><h2>{name}</h2><p>{items.filter(isComplete).length} of {items.length} intentions complete</p>{!items.length && <p>No intentions for this week.</p>}<ul className="review-goals">{items.map(item => <li key={item.id}><span className={isComplete(item) ? 'review-check complete' : 'review-check'}>{isComplete(item) ? '✓' : '·'}</span><span>{item.name}</span><small>{item.kind === 'count' ? item.count + ' / ' + item.target : isComplete(item) ? 'Done' : 'Not yet'}</small></li>)}</ul></section>
}

export default function Review() {
  const requested = new URLSearchParams(window.location.search).get('week')
  const start = requested || mondayISO()
  const [workspace, setWorkspace] = useState(null)
  const [history, setHistory] = useState([])
  const [reviews, setReviews] = useState([])
  const [wins, setWins] = useState('')
  const [obstacles, setObstacles] = useState('')
  const [carry, setCarry] = useState([])
  const [newGoals, setNewGoals] = useState([{ name: '', kind: 'one_time', target: 1 }])
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('loading')
  const [nextCount, setNextCount] = useState(0)

  useEffect(() => {
    let active = true
    async function load() {
      if (!validWeek(start)) throw new Error('That week is not valid. Open Review from This week.')
      const data = await loadCurrentWeek(start)
      if (!active) return
      if (data.signedOut) { setStatus('signed-out'); return }
      setWorkspace(data)
      const [weeks, reflections, plannedWeek] = await Promise.all([
        supabase.from('weeks').select('id, starts_on').eq('partnership_id', data.partnershipId).order('starts_on', { ascending: false }),
        supabase.from('weekly_reviews').select('*').eq('week_id', data.weekId),
        supabase.from('weeks').select('id').eq('partnership_id', data.partnershipId).eq('starts_on', nextWeek(start)).maybeSingle(),
      ])
      if (weeks.error) throw weeks.error
      if (reflections.error) throw new Error('Weekly reviews need the new database update before they can be used. Your existing goals and progress are safe.')
      if (plannedWeek.error) throw plannedWeek.error
      let count = 0
      if (plannedWeek.data) {
        const planned = await supabase.from('intentions').select('id', { count: 'exact', head: true }).eq('week_id', plannedWeek.data.id).eq('owner_id', data.user.id)
        if (planned.error) throw planned.error
        count = planned.count
      }
      if (active) { setHistory(weeks.data); setReviews(reflections.data); setNextCount(count); setStatus('ready') }
    }
    load().catch(problem => { if (active) { setError(problem.message); setStatus('error') } })
    return () => { active = false }
  }, [start])

  async function refreshReviews() {
    setBusy(true)
    const result = await supabase.from('weekly_reviews').select('*').eq('week_id', workspace.weekId)
    if (result.error) setError(result.error.message)
    else { setReviews(result.data); setError('') }
    setBusy(false)
  }
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const additions = newGoals.filter(item => item.name.trim()).map(item => ({ ...item, name: item.name.trim(), target: Number(item.target) }))
    try {
      const { error: saveError } = await supabase.rpc('wrap_up_week', {
        source_week: workspace.weekId, wins: wins.trim(), obstacles: obstacles.trim(),
        carry_ids: carry, new_intentions: additions,
      })
      if (saveError) throw saveError
      const result = await supabase.from('weekly_reviews').select('*').eq('week_id', workspace.weekId)
      if (result.error) throw result.error
      setReviews(result.data)
    } catch (problem) { setError('Couldn’t save your review. Your entries are still here. ' + problem.message) }
    finally { setBusy(false) }
  }
  function updateGoal(index, field, value) {
    setNewGoals(items => items.map((item, position) => position === index ? { ...item, [field]: value } : item))
  }

  if (status === 'loading') return <main className="review-shell"><p role="status">Opening your weekly check-in…</p></main>
  if (status === 'signed-out') return <main className="review-shell"><h1>Your shared weekly ritual.</h1><a href={appPath('/signin')}>Sign in to continue</a></main>
  if (status === 'error') return <main className="review-shell"><h1>We couldn’t open this review yet.</h1><p role="alert">{error}</p><a href={appPath('/week')}>Back to your week</a></main>
  const own = [...workspace.tasks, ...workspace.goals]
  const completedReview = reviews.find(review => review.user_id === workspace.user.id)
  const partnerReview = reviews.find(review => review.user_id === workspace.partner?.id)
  const options = own.filter(item => item.kind === 'count' || !isComplete(item))
  const plannedCount = nextCount + carry.length + newGoals.filter(item => item.name.trim()).length
  const future = start > mondayISO()

  return <main className="review-shell">
    <a className="review-back" href={appPath('/week?week=' + start)}>← Back to this week’s intentions</a>
    <header className="review-header"><p className="eyebrow">{weekLabel(start)}</p><h1>A little reflection.<br/>A fresh start.</h1><p>Ten minutes together. Notice what worked, make room for what didn’t, and choose what comes next.</p></header>
    <div className="review-history"><label htmlFor="review-week">Your shared history</label><select id="review-week" value={start} onChange={event => { window.location.href = appPath('/review?week=' + event.target.value) }}>{history.map(week => <option key={week.id} value={week.starts_on}>{weekLabel(week.starts_on)}{week.starts_on === mondayISO() ? ' · This week' : ''}</option>)}</select></div>
    <div className="review-grid"><ProgressSummary name="Your week" items={own}/>{workspace.partner ? <ProgressSummary name={workspace.partner.display_name + '’s week'} items={workspace.partnerItems}/> : <section className="review-card"><h2>Room for your person.</h2><p>You can reflect on your own, too. Invite Joey from This week whenever you’re ready.</p></section>}</div>
    {error && <p className="review-error" role="alert">{error}</p>}
    {completedReview ? <section className="review-card review-saved"><span className="eyebrow">Your review is saved</span><h2>Ready for another week.</h2><h3>What went well</h3><p className="review-prose">{completedReview.went_well || 'No reflection added.'}</p><h3>What got in the way</h3><p className="review-prose">{completedReview.got_in_way || 'No reflection added.'}</p><p>Your original goals and progress remain in this week’s history. Your selected intentions start fresh next week.</p><a className="review-primary" href={appPath('/week?week=' + nextWeek(start))}>Open next week’s plan →</a></section> : future ? <section className="review-card"><h2>This week is still ahead of you.</h2><p>Plan your intentions now; come back to reflect once the week begins.</p></section> :
      <form className="review-card review-form" onSubmit={submit}>
        <ol className="review-steps" aria-label="Review steps">{['Reflect', 'Carry forward', 'Plan next week'].map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
        {step === 1 && <><h2>How did the week feel?</h2><p>These reflections are shared with your partner. A sentence or two is plenty; either can be left blank.</p><label htmlFor="wins">What went well?</label><textarea id="wins" maxLength={1000} rows={3} value={wins} onChange={event => setWins(event.target.value)} placeholder="A small win counts."/><label htmlFor="obstacles">What got in the way?</label><textarea id="obstacles" maxLength={1000} rows={3} value={obstacles} onChange={event => setObstacles(event.target.value)} placeholder="What would make next week easier?"/></>}
        {step === 2 && <><h2>What deserves another week?</h2><p>Choose unfinished intentions to carry forward, or a routine you want to repeat. Nothing is selected automatically. All selected goals restart at zero, with the same target.</p>{!options.length && <p>No unfinished intentions or routines to carry forward. You can start fresh.</p>}<div className="carry-list">{options.map(item => <label key={item.id}><input type="checkbox" checked={carry.includes(item.id)} onChange={event => setCarry(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))}/><span>{item.name}<small>{item.kind === 'count' ? 'Repeat · target ' + item.target : 'Carry forward'}</small></span></label>)}</div></>}
        {step === 3 && <><h2>Keep next week achievable.</h2><p>{weekLabel(nextWeek(start))}. Aim for 3–4 intentions. {nextCount > 0 ? nextCount + ' already planned; these stay in place.' : ''}</p><p className="review-count">{plannedCount} intentions planned{plannedCount > 4 ? ' · Consider leaving some room to breathe.' : ''}</p>{newGoals.map((item, index) => <div className="new-intention" key={index}><label>New intention {index + 1}<input maxLength={160} value={item.name} onChange={event => updateGoal(index, 'name', event.target.value)} placeholder="Something you can realistically do"/></label><label>Track it as<select value={item.kind} onChange={event => updateGoal(index, 'kind', event.target.value)}><option value="one_time">Finish once</option><option value="count">Count progress</option></select></label>{item.kind === 'count' && <label>Target<input type="number" min="1" max="1000000" required={Boolean(item.name.trim())} value={item.target} onChange={event => updateGoal(index, 'target', event.target.value)}/></label>}</div>)}{newGoals.length < 4 && <button className="review-secondary" type="button" onClick={() => setNewGoals(items => [...items, { name: '', kind: 'one_time', target: 1 }])}>+ Add another intention</button>}<p>Saving shares your reflection and creates your next-week plan. Your partner saves their own review. You can edit the plan afterward; this reflection is saved as your record of the week.</p></>}
        <div className="review-actions">{step > 1 && <button type="button" className="review-secondary" disabled={busy} onClick={() => setStep(value => value - 1)}>Back</button>}{step < 3 ? <button type="button" className="review-primary" onClick={() => setStep(value => value + 1)}>Continue →</button> : <button type="submit" className="review-primary" disabled={busy}>{busy ? 'Saving your week…' : 'Save review & next week'}</button>}</div>
      </form>}
    {workspace.partner && <section className="review-card"><div className="review-partner-title"><h2>{workspace.partner.display_name}’s reflection</h2><button type="button" className="review-secondary" disabled={busy} onClick={refreshReviews}>Refresh</button></div>{partnerReview ? <><h3>What went well</h3><p className="review-prose">{partnerReview.went_well || 'No reflection added.'}</p><h3>What got in the way</h3><p className="review-prose">{partnerReview.got_in_way || 'No reflection added.'}</p></> : <p>They haven’t saved a reflection yet. You can finish yours whenever you’re ready.</p>}</section>}
  </main>
}
