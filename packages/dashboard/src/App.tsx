import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { HomePage } from './pages/Home';
import { AppDetailPage } from './pages/AppDetail';
import { ReconPage } from './pages/Recon';
import { LogsPage } from './pages/Logs';
import { DevicesPage } from './pages/Devices';
import { ExtractionStudioPage } from './pages/ExtractionStudio';
import { PingAppsPage } from './pages/PingApps';
import { PingAppDetailPage } from './pages/PingAppDetail';
import { AutomationPage } from './pages/Automation';
import { WatchTowerPage } from './pages/WatchTower';
import { AuthCenterPage } from './pages/AuthCenter';
import { SelfHealConsolePage } from './pages/SelfHealConsole';
import { LLMHub } from './pages/LLMHub';
import { FunctionsAPI } from './pages/FunctionsAPI';
import { DevTools } from './pages/DevTools';
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

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Core',
    items: [
      { to: '/', label: 'Dashboard', end: true },
      { to: '/devices', label: 'Devices' },
      { to: '/extract', label: 'Extraction' },
      { to: '/apps', label: 'PingApps' },
    ],
  },
  {
    title: 'Automation',
    items: [
      { to: '/automation', label: 'Workflows' },
      { to: '/watches', label: 'Watch Tower' },
      { to: '/recon', label: 'Recon' },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { to: '/llm', label: 'LLM Hub' },
      { to: '/heal', label: 'Self-Heal' },
      { to: '/auth', label: 'Auth Center' },
    ],
  },
  {
    title: 'Developer',
    items: [
      { to: '/functions', label: 'Functions' },
      { to: '/devtools', label: 'Dev Tools' },
      { to: '/logs', label: 'Logs' },
    ],
  },
];

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
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-dim">
                {section.title}
              </div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
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
            <div className="top-title">PingOS</div>
            <div className="top-sub">200+ ops. 14 PingApps. Your browser, now an API.</div>
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
              {/* Core */}
              <Route path="/" element={<HomePage />} />
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/extract" element={<ExtractionStudioPage />} />
              <Route path="/apps" element={<PingAppsPage />} />
              <Route path="/apps/:appName" element={<PingAppDetailPage />} />

              {/* Automation */}
              <Route path="/automation" element={<AutomationPage />} />
              <Route path="/watches" element={<WatchTowerPage />} />
              <Route path="/recon" element={<ReconPage />} />

              {/* Intelligence */}
              <Route path="/llm" element={<LLMHub />} />
              <Route path="/heal" element={<SelfHealConsolePage />} />
              <Route path="/auth" element={<AuthCenterPage />} />

              {/* Developer */}
              <Route path="/functions" element={<FunctionsAPI />} />
              <Route path="/devtools" element={<DevTools />} />
              <Route path="/logs" element={<LogsPage />} />

              {/* Legacy */}
              <Route path="/app/:port" element={<AppDetailPage />} />
            </Routes>
          </Shell>
        </ActivityProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
