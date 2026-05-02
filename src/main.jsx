import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Root from './Root.jsx'
import App from './App.jsx'
import Week from './Week.jsx'
import ShareView from './pages/ShareView.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/cadence">
      <Routes>
        {/* Layout route: renders Root (nav) then the matched child via Outlet */}
        <Route element={<Root />}>
          <Route path="/" element={<App />} />
          <Route path="/week" element={<Week />} />
        </Route>
        {/* Standalone route: no nav wrapper */}
        <Route path="/share" element={<ShareView />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
