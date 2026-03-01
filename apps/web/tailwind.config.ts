import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        finance: {
          positive: '#16a34a',
          warning: '#f59e0b',
          negative: '#ef4444',
          neutral: '#334155'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      spacing: {
        'row-sm': '0.375rem',
        'row-md': '0.625rem',
        'row-lg': '0.875rem'
      }
    }
  },
  plugins: []
}

export default config
