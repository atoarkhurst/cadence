import { NavLink, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import Week from './Week.jsx'
import './Root.css'

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
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/week" element={<Week />} />
      </Routes>
    </>
  )
}

export default Root
