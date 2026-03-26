import ClockWidget from '../components/ClockWidget'
import AppTile from '../components/AppTile'
import { apps } from '../config/apps'

export default function Home() {
  return (
    <div className="flex flex-col h-full">
      {/* Clock widget */}
      <ClockWidget />

      {/* Divider */}
      <div className="mx-8 h-px bg-zinc-800/50" />

      {/* App grid */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-4">
        <div className="grid grid-cols-3 gap-y-4 gap-x-2 justify-items-center">
          {apps.map((app) => (
            <AppTile key={app.id} app={app} />
          ))}
        </div>
      </div>
    </div>
  )
}
