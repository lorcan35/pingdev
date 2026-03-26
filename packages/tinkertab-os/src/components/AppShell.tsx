import { Outlet } from 'react-router-dom'
import StatusBar from './StatusBar'
import Dock from './Dock'

export default function AppShell() {
  return (
    <div className="flex flex-col h-full w-full">
      <StatusBar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
      <Dock />
    </div>
  )
}
