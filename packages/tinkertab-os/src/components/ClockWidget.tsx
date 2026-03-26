import { useState, useEffect } from 'react'

function getTime(date: Date) {
  return {
    hours: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    date: date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  }
}

export default function ClockWidget() {
  const [now, setNow] = useState(getTime(new Date()))

  useEffect(() => {
    const timer = setInterval(() => setNow(getTime(new Date())), 10_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex flex-col items-center py-10">
      <span className="text-7xl font-extralight tracking-tight text-zinc-50 tabular-nums">
        {now.hours}
      </span>
      <span className="text-lg text-zinc-400 mt-1 font-light">
        {now.date}
      </span>
    </div>
  )
}
