import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        gold: {
          dim:    'rgba(201,169,110,0.35)',
          base:   '#C9A96E',
          bright: '#E8C882',
          dark:   '#B8963E',
        },
        surface: {
          glass:  'rgba(255,255,255,0.03)',
          card:   'rgba(18,14,12,0.85)',
        },
        brand: {
          red:    '#7A1B22',
          amber:  '#D4782A',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':  'spin 3s linear infinite',
      },
      backdropBlur: {
        xs: '4px',
      },
    },
  },
  plugins: [],
};

export default config;
