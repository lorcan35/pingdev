import { Routes, Route } from 'react-router-dom'
import AppShell from './components/AppShell'
import Home from './pages/Home'
import ChatPage from './pages/Chat'
import PlaceholderPage from './pages/PlaceholderPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/browse" element={<PlaceholderPage />} />
        <Route path="/apps" element={<PlaceholderPage />} />
        <Route path="/settings" element={<PlaceholderPage />} />
      </Route>
    </Routes>
  )
}
