import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        background: '#080808',
        card: '#141414',
        card2: '#0F0F14',
        border: 'rgba(255,255,255,0.06)',
        primary: {
          DEFAULT: '#E50914',
          dark: '#B00710',
          light: '#FF3B45',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        glowPulse: 'glowPulse 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
export default config
