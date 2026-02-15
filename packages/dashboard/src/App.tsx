import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { HomePage } from './pages/Home';
import { AppDetailPage } from './pages/AppDetail';
import { ReconPage } from './pages/Recon';
import { LogsPage } from './pages/Logs';
import { CommandBar } from './components/CommandBar';
import { ActivityProvider } from './components/Activity';
import { ToastProvider } from './components/Toasts';

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
      <line x1="22" y1="16" x2="28" y2="16" stroke="currentColor" strokeWidth="1.5" />
      <line x1="4" y1="16" x2="10" y2="16" stroke="currentColor" strokeWidth="1.5" />
      <line x1="16" y1="4" x2="16" y2="10" stroke="currentColor" strokeWidth="1.5" />
      <line x1="16" y1="22" x2="16" y2="28" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <div className="bg-grid" aria-hidden="true" />
      <aside className="side">
        <NavLink to="/" className="brand" style={{ textDecoration: 'none' }}>
          <span className="brand-mark"><LogoMark /></span>
          <span className="brand-text">
            <span className="brand-title">PingOS</span>
            <span className="brand-sub">mission control</span>
          </span>
        </NavLink>

        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>Apps</NavLink>
          <NavLink to="/recon" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>Recon</NavLink>
          <NavLink to="/logs" className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>Logs</NavLink>
        </nav>

        <div className="side-foot">
          <div className="side-hint">
            <div className="side-hint-title">Tip</div>
            <div className="side-hint-sub">Ctrl/Cmd+K for commands</div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <div className="top-left">
            <div className="top-title">Dashboard</div>
            <div className="top-sub">Local-first agents, observable in real time.</div>
          </div>
          <div className="top-right">
            <CommandBar />
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ActivityProvider>
          <Shell>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/app/:port" element={<AppDetailPage />} />
              <Route path="/recon" element={<ReconPage />} />
              <Route path="/logs" element={<LogsPage />} />
            </Routes>
          </Shell>
        </ActivityProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
