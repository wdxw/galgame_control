/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        surface: {
          50: 'rgb(var(--surface-50) / <alpha-value>)',
          100: 'rgb(var(--surface-100) / <alpha-value>)',
          200: 'rgb(var(--surface-200) / <alpha-value>)',
          300: 'rgb(var(--surface-300) / <alpha-value>)',
          400: 'rgb(var(--surface-400) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          secondary: 'rgb(var(--accent-secondary) / <alpha-value>)',
          success: 'rgb(var(--accent-success) / <alpha-value>)',
          warning: 'rgb(var(--accent-warning) / <alpha-value>)',
          danger: 'rgb(var(--accent-danger) / <alpha-value>)',
        }
      },
      fontFamily: {
        sans: ['"Segoe UI"', '"Microsoft YaHei"', 'sans-serif'],
        mono: ['"Cascadia Code"', 'Consolas', 'monospace'],
      },
      animation: {
        'shimmer': 'shimmer 1.5s infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
