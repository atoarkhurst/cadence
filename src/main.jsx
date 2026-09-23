import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Root from './Root.jsx'
import App from './App.jsx'
import Week from './Week.jsx'
import ShareView from './pages/ShareView.jsx'
import Auth from './Auth.jsx'
import Invite from './Invite.jsx'
import Review from './Review.jsx'

const routerBase = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={routerBase}>
      <Routes>
        {/* Layout route: renders Root (nav) then the matched child via Outlet */}
        <Route element={<Root />}>
          <Route path="/" element={<App />} />
          <Route path="/week" element={<Week />} />
          <Route path="/review" element={<Review />} />
          <Route path="/signin" element={<Auth />} />
          <Route path="/invite/:token" element={<Invite />} />
        </Route>
        {/* Standalone route: no nav wrapper */}
        <Route path="/share" element={<ShareView />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
