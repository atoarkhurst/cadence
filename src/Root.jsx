import { NavLink, Outlet } from 'react-router-dom'
import './Root.css'

// Root is a layout route: it renders the nav, then <Outlet> which React Router
// fills with whichever child route matched. /share is registered as a sibling
// route (not a child) so it renders without this nav.
function Root() {
  return (
    <>
      <nav className="main-nav" aria-label="Main navigation">
        <span className="wordmark">cadence</span>
        <div className="nav-tabs">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <svg className="nav-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
            Today
          </NavLink>
          <NavLink to="/week" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <svg className="nav-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h3m4 0h3m-10 3h3"/></svg>
            This week
          </NavLink>
          <NavLink to="/signin" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <svg className="nav-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>
            Account
          </NavLink>
        </div>
      </nav>
      <Outlet />
    </>
  )
}

export default Root
