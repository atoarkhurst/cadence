import { useLayoutEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import './Root.css'
import './Encouragement.css'
import EncouragementProvider from './EncouragementProvider.jsx'
import { useEncouragement } from './lib/encouragement-context.js'

// Root is a layout route: it renders the nav, then <Outlet> which React Router
// fills with whichever child route matched. /share is registered as a sibling
// route (not a child) so it renders without this nav.
function Root() {
  return (
    <EncouragementProvider>
      <Navigation />
    </EncouragementProvider>
  )
}

function Navigation() {
  const { unreadCount, userId } = useEncouragement()
  const { pathname, hash } = useLocation()

  useLayoutEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])

  return (
    <>
      <nav className="main-nav" aria-label="Main navigation">
        <span className="wordmark">cadence</span>
        <div className="nav-account-tools">
          {userId && (
            <NavLink
              to="/encouragement"
              className="encouragement-link"
              aria-label={unreadCount ? `Encouragement, ${unreadCount} unread` : 'Encouragement'}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 3V7.5A4.5 4.5 0 0 1 8.5 3h7A4.5 4.5 0 0 1 20 7.5z" />
                <path d="M8 8h8M8 12h5" />
              </svg>
              {unreadCount > 0 && (
                <span className="encouragement-badge" aria-hidden="true">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </NavLink>
          )}
          <div className="nav-tabs">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <svg
                className="nav-icon"
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
              </svg>
              Today
            </NavLink>
            <NavLink
              to="/week"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <svg
                className="nav-icon"
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="5" width="18" height="16" rx="3" />
                <path d="M7 3v4m10-4v4M3 11h18m-14 4h3m4 0h3m-10 3h3" />
              </svg>
              This week
            </NavLink>
            <NavLink
              to="/signin"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <svg
                className="nav-icon"
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
              </svg>
              Account
            </NavLink>
          </div>
        </div>
      </nav>
      <Outlet />
    </>
  )
}

export default Root
