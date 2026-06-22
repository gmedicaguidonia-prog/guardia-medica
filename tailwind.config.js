/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Palette olive/salvia (coerente con SISTEMA TURNAZIONE)
        olive: {
          50:  '#f2f4ee',
          100: '#e0e8d8',
          200: '#c0d0b0',
          300: '#9ab488',
          400: '#739660',
          500: '#577a45',
          600: '#476540',
          700: '#374f30',
          800: '#2b3c24',
          900: '#1c2818',
        },
        // Palette crema calda
        cream: {
          50:  '#fefefc',
          100: '#faf8f3',
          200: '#f4f0e6',
          300: '#ece5d5',
          400: '#e2d8c3',
          500: '#d5c8a8',
        },
      },
    },
  },
  plugins: [],
}
