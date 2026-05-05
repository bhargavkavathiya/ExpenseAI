/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,scss}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      colors: {
        ink: {
          0: '#060810',
          1: '#0d1117',
          2: '#121820',
          3: '#18202e',
          4: '#1e2a3a',
          5: '#243346'
        },
        line: {
          DEFAULT: '#1f2d40',
          2: '#283a50'
        },
        fog:   '#7a8fa8',
        mist:  '#9aafc4',
        cloud: '#c4d4e4',
        snow:  '#e8f0f8',
        sapphire: { DEFAULT: '#2563eb', light: '#3b82f6' },
        emerald:  { DEFAULT: '#059669', light: '#10b981' },
        amber:    { DEFAULT: '#d97706', light: '#f59e0b' },
        crimson:  { DEFAULT: '#dc2626', light: '#ef4444' },
        violet:   { DEFAULT: '#7c3aed', light: '#8b5cf6' },
        teal:     { DEFAULT: '#0891b2', light: '#06b6d4' },
        rose:     { DEFAULT: '#be185d', light: '#ec4899' }
      },
      boxShadow: {
        'card':      '0 4px 20px rgba(0,0,0,0.4)',
        'card-lg':   '0 8px 40px rgba(0,0,0,0.5)',
        'glow-blue': '0 0 24px rgba(59,130,246,0.2)',
        'glow-green':'0 0 24px rgba(16,185,129,0.2)'
      },
      borderRadius: { 'xl2': '22px' },
      animation: {
        'fade-up': 'fade-up 0.25s ease',
        'pulse-ring': 'pulse-ring 2s infinite'
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: 0, transform: 'translateY(6px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        },
        'pulse-ring': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(59,130,246,0.4)' },
          '50%':      { boxShadow: '0 0 0 6px rgba(59,130,246,0)' }
        }
      }
    }
  },
  plugins: [require('@tailwindcss/forms')]
}
