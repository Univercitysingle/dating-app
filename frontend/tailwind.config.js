/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#ff79c6',
          DEFAULT: '#ff4081',
          dark: '#c60055',
        },
        secondary: {
          light: '#bd93f9',
          DEFAULT: '#8a2be2',
          dark: '#5a00b4',
        },
        accent: {
          light: '#f1fa8c',
          DEFAULT: '#ffeb3b',
          dark: '#b8b400',
        },
        neutral: {
          50: '#f8f8f2',
          100: '#f1f1f0',
          200: '#e2e2e1',
          300: '#d3d3d2',
          400: '#c4c4c3',
          500: '#b5b5b4',
          600: '#919190',
          700: '#6d6d6c',
          800: '#494948',
          900: '#252524',
        },
      },
      boxShadow: {
        'card': '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        'button': '0 4px 14px 0 rgba(0, 118, 255, 0.39)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
