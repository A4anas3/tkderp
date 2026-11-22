/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  safelist: [
    {
      pattern: /(bg|text|border|ring|from|to|via)-(odoo)(-[a-z0-9]+)?/,
      variants: ['hover', 'focus', 'active', 'disabled', 'sm', 'md', 'lg'],
    },
  ],
  theme: {
    extend: {
      colors: {
        odoo: {
          50: '#f8f4f7',
          100: '#efe7ed',
          200: '#dec4da',
          300: '#c99ebf',
          400: '#a46e96',
          500: '#8a567c',
          DEFAULT: '#714b67',
          600: '#714b67',
          700: '#5e3c55',
          800: '#4b3044',
          900: '#382433',
          950: '#241421',
          teal: '#017e84',
          'teal-dark': '#006b70',
          'teal-light': '#e6f4f4',
        },
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          900: '#312e81',
        },
      },
    },
  },
  plugins: [],
}
