export interface AppConfig {
  id: string
  name: string
  icon: string
  route: string
  badge?: number
  color?: string
}

export const apps: AppConfig[] = [
  { id: 'chat', name: 'Chat', icon: '\u{1F4AC}', route: '/chat', color: '#06b6d4' },
  { id: 'browse', name: 'Browse', icon: '\u{1F310}', route: '/browse', color: '#8b5cf6' },
  { id: 'apps', name: 'Apps', icon: '\u{1F4F1}', route: '/apps', color: '#10b981' },
  { id: 'settings', name: 'Settings', icon: '\u{2699}\u{FE0F}', route: '/settings', color: '#a1a1aa' },
  { id: 'claude', name: 'Claude', icon: '\u{1F916}', route: '/chat?app=claude', color: '#f97316' },
  { id: 'gemini', name: 'Gemini', icon: '\u{1F9E0}', route: '/chat?app=gemini', color: '#3b82f6' },
  { id: 'chatgpt', name: 'ChatGPT', icon: '\u{1F4AC}', route: '/chat?app=chatgpt', color: '#10b981' },
  { id: 'aliexpress', name: 'AliExpress', icon: '\u{1F6D2}', route: '/browse?url=aliexpress', color: '#ef4444' },
  { id: 'youtube', name: 'YouTube', icon: '\u{1F4FA}', route: '/browse?url=youtube', color: '#ef4444' },
]

export const dockApps: AppConfig[] = [
  { id: 'chat', name: 'Chat', icon: '\u{1F4AC}', route: '/chat' },
  { id: 'browse', name: 'Browse', icon: '\u{1F310}', route: '/browse' },
  { id: 'apps', name: 'Apps', icon: '\u{1F4F1}', route: '/apps' },
  { id: 'settings', name: 'Settings', icon: '\u{2699}\u{FE0F}', route: '/settings' },
]
