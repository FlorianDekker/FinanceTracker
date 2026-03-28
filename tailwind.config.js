/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#111111',
        surface: '#1c1c1e',
        border: '#2a2a2a',
        green: '#4CAF50',
        red: '#D32F2F',
        muted: '#aaaaaa',
        orange: '#FF9F0A',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
