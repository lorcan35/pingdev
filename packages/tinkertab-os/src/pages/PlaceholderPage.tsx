import { useLocation } from 'react-router-dom'

const pageInfo: Record<string, { title: string; icon: string; message: string }> = {
  '/chat': { title: 'Chat', icon: '\u{1F4AC}', message: 'Chat coming soon' },
  '/browse': { title: 'Browse', icon: '\u{1F310}', message: 'Browser coming soon' },
  '/apps': { title: 'Apps', icon: '\u{1F4F1}', message: 'App Gallery coming soon' },
  '/settings': { title: 'Settings', icon: '\u{2699}\u{FE0F}', message: 'Settings coming soon' },
}

export default function PlaceholderPage() {
  const location = useLocation()
  const info = pageInfo[location.pathname] || { title: 'Page', icon: '\u{1F4CB}', message: 'Coming soon' }

  const params = new URLSearchParams(location.search)
  const appName = params.get('app')
  const url = params.get('url')
  const subtitle = appName
    ? `${appName.charAt(0).toUpperCase() + appName.slice(1)}`
    : url
      ? `${url.charAt(0).toUpperCase() + url.slice(1)}`
      : null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 px-5 flex items-center border-b border-zinc-800/50 flex-shrink-0">
        <span className="text-lg font-semibold text-zinc-50">
          {info.title}
          {subtitle && (
            <span className="text-zinc-500 font-normal"> / {subtitle}</span>
          )}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <span className="text-6xl">{info.icon}</span>
        <p className="text-zinc-500 text-lg">{info.message}</p>
        {subtitle && (
          <p className="text-cyan-500/60 text-sm">{subtitle} integration pending</p>
        )}
      </div>
    </div>
  )
}
