import { useState } from 'react'
import { removeIntention, updateIntention } from '../lib/cadence.js'

// Both views edit the same weekly intention and retain its progress records.
export function useIntentionEditing({ workspace, tasks, goals, setTasks, setGoals, saveChange }) {
  const [editing, setEditing] = useState(null)

  function beginEdit(item, kind) {
    setEditing({
      id: item.id,
      kind,
      name: item.name,
      target: String(item.target ?? ''),
      originalName: item.name,
      originalTarget: item.target ?? null,
    })
  }

  function confirmDelete(item, setter) {
    if (!window.confirm(`Delete “${item.name}”? Its progress for this week will be removed.`))
      return
    saveChange(async () => {
      await removeIntention(item.id)
      setter((items) => items.filter((entry) => entry.id !== item.id))
      if (editing?.id === item.id) setEditing(null)
    })
  }

  async function saveEdit(event) {
    event.preventDefault()
    if (!editing) return
    const isCount = editing.kind === 'count'
    const original = (isCount ? goals : tasks).find((item) => item.id === editing.id)
    if (!original) {
      setEditing(null)
      return
    }
    const title = editing.name.trim()
    const target = isCount ? Number(editing.target) : null
    await saveChange(async () => {
      await updateIntention(
        {
          id: editing.id,
          kind: editing.kind,
          name: editing.originalName,
          target: editing.originalTarget,
        },
        workspace.user.id,
        title,
        target,
      )
      const setter = isCount ? setGoals : setTasks
      setter((items) =>
        items.map((item) => (item.id === original.id ? { ...item, name: title, target } : item)),
      )
      setEditing(null)
    })
  }

  return { editing, setEditing, beginEdit, confirmDelete, saveEdit }
}
