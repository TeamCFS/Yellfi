import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './index.html',
  ],
  theme: {
    extend: {
      colors: {
        // YellFi Brand Colors
        yellfi: {
          yellow: {
            50: '#FFF9E6',
            100: '#FFF0BF',
            200: '#FFE699',
            300: '#FFDB66',
            400: '#FFD133',
            500: '#F7B928',
            600: '#E5A820',
            700: '#CC9518',
            800: '#B38210',
            900: '#8C6608',
          },
          blue: {
            50: '#E6F7FF',
            100: '#B3E5FF',
            200: '#80D4FF',
            300: '#4DC3FF',
            400: '#1AB2FF',
            500: '#00A3FF',
            600: '#0092E6',
            700: '#0080CC',
            800: '#006EB3',
            900: '#005C99',
          },
          cyan: {
            50: '#E6FCFF',
            100: '#B3F5FF',
            200: '#80EEFF',
            300: '#4DE7FF',
            400: '#1AE0FF',
            500: '#00D4FF',
            600: '#00BFE6',
            700: '#00AACC',
            800: '#0095B3',
            900: '#007A99',
          },
          dark: {
            primary: '#0A1628',
            secondary: '#0D1B2A',
            tertiary: '#132238',
            elevated: '#1A2D47',
            card: '#162032',
          },
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #FFD700 0%, #F7B928 50%, #E5A820 100%)',
        'gradient-secondary': 'linear-gradient(135deg, #00D4FF 0%, #00A3FF 50%, #0080CC 100%)',
        'gradient-glow': 'linear-gradient(135deg, rgba(247, 185, 40, 0.4) 0%, rgba(0, 163, 255, 0.4) 100%)',
        'gradient-card': 'linear-gradient(180deg, rgba(22, 32, 50, 0.8) 0%, rgba(13, 27, 42, 0.9) 100%)',
        'gradient-hero': 'radial-gradient(ellipse at center, rgba(0, 163, 255, 0.15) 0%, transparent 70%)',
        'gradient-border': 'linear-gradient(135deg, rgba(247, 185, 40, 0.5) 0%, rgba(0, 163, 255, 0.5) 100%)',
      },
      boxShadow: {
        'glow-yellow': '0 0 20px rgba(247, 185, 40, 0.3), 0 0 40px rgba(247, 185, 40, 0.1)',
        'glow-blue': '0 0 20px rgba(0, 163, 255, 0.3), 0 0 40px rgba(0, 163, 255, 0.1)',
        'glow-cyan': '0 0 20px rgba(0, 212, 255, 0.3), 0 0 40px rgba(0, 212, 255, 0.1)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3)',
        'elevated': '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
