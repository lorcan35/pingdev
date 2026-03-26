import { useState, useEffect } from 'react'

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export default function StatusBar() {
  const [time, setTime] = useState(formatTime(new Date()))

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(formatTime(new Date()))
    }, 10_000) // update every 10s is fine
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="h-8 px-4 flex items-center justify-between bg-zinc-950/80 backdrop-blur-sm text-xs text-zinc-400 flex-shrink-0 z-50">
      {/* Left: time */}
      <span className="font-medium text-zinc-300">{time}</span>

      {/* Center: AI tier */}
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
        <span className="text-cyan-500 font-medium">AI Local</span>
      </div>

      {/* Right: connectivity + battery */}
      <div className="flex items-center gap-2">
        {/* WiFi icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M1.42 9a16 16 0 0 1 21.16 0" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>

        {/* Battery */}
        <div className="flex items-center gap-0.5">
          <div className="w-5 h-2.5 rounded-sm border border-zinc-500 p-[1px] flex items-center">
            <div className="h-full w-3/4 bg-emerald-500 rounded-[1px]" />
          </div>
          <div className="w-[2px] h-1.5 bg-zinc-500 rounded-r-sm" />
        </div>
      </div>
    </div>
  )
}
