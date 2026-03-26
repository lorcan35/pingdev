import { useNavigate } from 'react-router-dom'
import type { AppConfig } from '../config/apps'

interface AppTileProps {
  app: AppConfig
}

export default function AppTile({ app }: AppTileProps) {
  const navigate = useNavigate()

  const handleTap = () => {
    navigate(app.route)
  }

  return (
    <button
      onClick={handleTap}
      className="flex flex-col items-center justify-center gap-2 py-3 active:scale-90 transition-transform duration-100 relative"
      style={{ minHeight: '96px', minWidth: '48px' }}
    >
      {/* Icon container */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${app.color || '#27272a'}22, ${app.color || '#27272a'}44)`,
          border: `1px solid ${app.color || '#27272a'}33`,
        }}
      >
        {app.icon}
      </div>

      {/* Badge */}
      {app.badge && app.badge > 0 && (
        <div className="absolute top-2 right-4 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
          <span className="text-[10px] font-bold text-white">{app.badge > 9 ? '9+' : app.badge}</span>
        </div>
      )}

      {/* Label */}
      <span className="text-xs text-zinc-400 truncate max-w-[80px]">{app.name}</span>
    </button>
  )
}
