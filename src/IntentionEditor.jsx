// Shared by Today and This week so goal editing behaves consistently.
export function IntentionActions({ item, onEdit, onDelete, busy = false }) {
  return (
    <details
      className="intention-actions-menu"
      name="intention-actions"
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.currentTarget.open = false
      }}
    >
      <summary aria-label={`Options for ${item.name}`} title={`Options for ${item.name}`}>
        ⋯
      </summary>
      <div className="intention-actions-popover">
        <button
          type="button"
          disabled={busy}
          onClick={(event) => {
            event.currentTarget.closest('details').open = false
            onEdit()
          }}
        >
          Edit goal
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={(event) => {
            event.currentTarget.closest('details').open = false
            onDelete()
          }}
        >
          Delete goal
        </button>
      </div>
    </details>
  )
}

export function IntentionEditor({ draft, setDraft, onSave, onCancel, busy }) {
  return (
    <form className="intention-editor" onSubmit={onSave}>
      <label>
        <span>Goal name</span>
        <input
          aria-label="Edit goal name"
          disabled={busy}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          maxLength={160}
          required
          autoFocus
        />
      </label>
      {draft.kind === 'count' && (
        <label className="weekly-amount-field">
          <span>How many this week?</span>
          <input
            aria-label="Edit weekly amount"
            disabled={busy}
            type="number"
            min="1"
            max="1000000"
            step="1"
            inputMode="numeric"
            value={draft.target}
            onChange={(event) => setDraft({ ...draft, target: event.target.value })}
            required
          />
        </label>
      )}
      <div className="intention-editor-actions">
        <button type="submit" disabled={busy}>
          Save changes
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}
