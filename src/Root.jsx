import { NavLink, Outlet } from 'react-router-dom'
import './Root.css'

// Root is a layout route: it renders the nav, then <Outlet> which React Router
// fills with whichever child route matched. /share is registered as a sibling
// route (not a child) so it renders without this nav.
function Root() {
  return (
    <>
      <nav className="main-nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Daily
        </NavLink>
        <NavLink to="/week" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Weekly
        </NavLink>
      </nav>
      <Outlet />
    </>
  )
}

export default Root
