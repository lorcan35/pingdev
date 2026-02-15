import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#111111',
        border: '#222222',

        fg: 'rgba(236, 244, 255, 0.92)',
        muted: 'rgba(236, 244, 255, 0.66)',
        dim: 'rgba(236, 244, 255, 0.44)',

        accent: {
          green: '#00ff88',
          cyan: '#00d4ff',
        },
        health: {
          healthy: '#00ff88',
          degraded: '#ffcc00',
          offline: '#ff3b5c',
        },
      },
      boxShadow: {
        'glow-green': '0 0 0 1px rgba(0, 255, 136, 0.18), 0 0 22px rgba(0, 255, 136, 0.18)',
        'glow-cyan': '0 0 0 1px rgba(0, 212, 255, 0.18), 0 0 22px rgba(0, 212, 255, 0.18)',
        'glow-amber': '0 0 0 1px rgba(255, 204, 0, 0.16), 0 0 22px rgba(255, 204, 0, 0.14)',
        'glow-red': '0 0 0 1px rgba(255, 59, 92, 0.18), 0 0 22px rgba(255, 59, 92, 0.16)',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '0.15' },
          '50%': { opacity: '0.55' },
        },
        floatDot: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        pulseGlow: 'pulseGlow 1.6s ease-in-out infinite',
      },
    },
  },
} satisfies Config;

