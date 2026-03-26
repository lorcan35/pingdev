import { useNavigate, useLocation } from 'react-router-dom'
import { dockApps } from '../config/apps'

export default function Dock() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="h-16 bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800/50 flex items-center justify-around px-4 flex-shrink-0">
      {dockApps.map((app) => {
        const isActive = location.pathname === app.route ||
          (app.route === '/' && location.pathname === '/')

        return (
          <button
            key={app.id}
            onClick={() => navigate(app.route)}
            className={`flex flex-col items-center justify-center gap-1 w-16 h-14 rounded-xl active:scale-90 transition-all duration-100 ${
              isActive ? 'text-cyan-500' : 'text-zinc-500'
            }`}
          >
            <span className="text-xl">{app.icon}</span>
            <span className="text-[10px] font-medium">{app.name}</span>
          </button>
        )
      })}
    </div>
  )
}
