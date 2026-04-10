/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        dark: {
          50: '#f8f9fa',
          100: '#e9ecef',
          200: '#dee2e6',
          700: '#2d2d3d',
          800: '#1e1e2e',
          900: '#111117',
          950: '#0a0a10'
        }
      }
    }
  },
  plugins: []
}
