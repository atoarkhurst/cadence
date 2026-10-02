import { useEffect, useRef, useState } from 'react'
import { useEncouragement } from './lib/encouragement-context.js'

export default function EncouragementNote({
  notification,
  author,
  message,
  children,
  featured = false,
}) {
  const element = useRef(null)
  const { read } = useEncouragement()
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const longNote = featured && message.length > 160
  const unread = notification && !notification.read_at
  useEffect(() => {
    if (!unread || !element.current || !('IntersectionObserver' in window)) return
    let visible = false,
      timer,
      active = true
    const check = () => {
      clearTimeout(timer)
      if (visible && document.visibilityState === 'visible')
        timer = setTimeout(() => {
          void read(notification.id).then((ok) => {
            if (active && !ok) setError(true)
          })
        }, 1200)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.5
        check()
      },
      { threshold: [0, 0.5] },
    )
    observer.observe(element.current)
    document.addEventListener('visibilitychange', check)
    return () => {
      active = false
      clearTimeout(timer)
      observer.disconnect()
      document.removeEventListener('visibilitychange', check)
    }
  }, [unread, notification?.id, read])
  return (
    <article
      ref={element}
      className={`cheer-card received-note ${unread ? 'unread-note' : ''} ${featured ? 'featured-note' : ''}`}
      id={notification ? `note-${notification.id}` : undefined}
    >
      <span className="avatar joey" aria-hidden="true">
        {author?.[0]?.toUpperCase() || 'P'}
      </span>
      <div className="note-content">
        <strong>{author || 'Your partner'}</strong>
        {unread && <span className="new-note-label">New</span>}
        <p className={longNote && !expanded ? 'note-excerpt' : undefined}>{message}</p>
        {longNote && (
          <button className="note-expand" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Show less' : 'Read full note'}
          </button>
        )}
        {children}
        {unread && (
          <button
            className="note-read"
            onClick={async () => setError(!(await read(notification.id)))}
          >
            Mark as read
          </button>
        )}
        {error && <small role="status">Couldn’t update the unread marker. Try again.</small>}
      </div>
    </article>
  )
}
