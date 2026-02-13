import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { HomePage } from './pages/Home';
import { AppDetailPage } from './pages/AppDetail';
import { ReconPage } from './pages/Recon';
import { LogsPage } from './pages/Logs';

function TopBar() {
  return (
    <header className="topbar">
      <NavLink to="/" className="topbar-logo" style={{ textDecoration: 'none' }}>
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="6" stroke="#00ff88" strokeWidth="2" />
          <circle cx="16" cy="16" r="2" fill="#00ff88" />
          <line x1="22" y1="16" x2="28" y2="16" stroke="#00ff88" strokeWidth="1.5" />
          <line x1="4" y1="16" x2="10" y2="16" stroke="#00ff88" strokeWidth="1.5" />
          <line x1="16" y1="4" x2="16" y2="10" stroke="#00ff88" strokeWidth="1.5" />
          <line x1="16" y1="22" x2="16" y2="28" stroke="#00ff88" strokeWidth="1.5" />
        </svg>
        PingDev
      </NavLink>
      <nav className="topbar-nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
          Apps
        </NavLink>
        <NavLink to="/recon" className={({ isActive }) => isActive ? 'active' : ''}>
          Recon
        </NavLink>
        <NavLink to="/logs" className={({ isActive }) => isActive ? 'active' : ''}>
          Logs
        </NavLink>
      </nav>
    </header>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <TopBar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/app/:port" element={<AppDetailPage />} />
            <Route path="/recon" element={<ReconPage />} />
            <Route path="/logs" element={<LogsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
