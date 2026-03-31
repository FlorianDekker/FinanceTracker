/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#1c1c1e',
        'surface-2': '#2c2c2e',
        border: '#2a2a2a',
        green: '#30D158',
        'green-dim': '#0d2e1a',
        red: '#FF453A',
        'red-dim': '#2e0d0d',
        muted: '#8e8e93',
        orange: '#FF9F0A',
        blue: '#0A84FF',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'sans-serif'],
      },
      keyframes: {
        'slide-in-left': {
          '0%':   { opacity: '0', transform: 'translateX(40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-right': {
          '0%':   { opacity: '0', transform: 'translateX(-40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.75)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'fade-in-up': {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%':   { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'fade-out': {
          '0%':   { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'slide-in-left':  'slide-in-left  0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both',
        'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both',
        'fade-in':        'fade-in        0.2s ease-out both',
        'slide-up':       'slide-up       0.35s cubic-bezier(0.32, 0.72, 0, 1) both',
        'slide-down':     'slide-down     0.3s cubic-bezier(0.32, 0.72, 0, 1) both',
        'fade-out':       'fade-out       0.3s ease-out both',
        'scale-in':       'scale-in       0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'fade-in-up':     'fade-in-up     0.25s ease-out both',
      },
    },
  },
  plugins: [],
}
