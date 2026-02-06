// YellFi Brand Design Tokens
// Extracted from logo: yellow/gold primary, blue secondary, dark space background

export const brand = {
  colors: {
    // Primary - Yellow/Gold (robot accents, "Yell" text)
    primary: {
      50: '#FFF9E6',
      100: '#FFF0BF',
      200: '#FFE699',
      300: '#FFDB66',
      400: '#FFD133',
      500: '#F7B928', // Main brand yellow
      600: '#E5A820',
      700: '#CC9518',
      800: '#B38210',
      900: '#8C6608',
    },
    
    // Secondary - Blue (robot eyes, "Fi" text, circuits)
    secondary: {
      50: '#E6F7FF',
      100: '#B3E5FF',
      200: '#80D4FF',
      300: '#4DC3FF',
      400: '#1AB2FF',
      500: '#00A3FF', // Main brand blue
      600: '#0092E6',
      700: '#0080CC',
      800: '#006EB3',
      900: '#005C99',
    },
    
    // Accent - Cyan glow
    accent: {
      50: '#E6FCFF',
      100: '#B3F5FF',
      200: '#80EEFF',
      300: '#4DE7FF',
      400: '#1AE0FF',
      500: '#00D4FF', // Glow cyan
      600: '#00BFE6',
      700: '#00AACC',
      800: '#0095B3',
      900: '#007A99',
    },
    
    // Background - Dark space theme
    background: {
      primary: '#0A1628',
      secondary: '#0D1B2A',
      tertiary: '#132238',
      elevated: '#1A2D47',
      card: '#162032',
      overlay: 'rgba(10, 22, 40, 0.95)',
    },
    
    // Neutral
    neutral: {
      50: '#F8FAFC',
      100: '#F1F5F9',
      200: '#E2E8F0',
      300: '#CBD5E1',
      400: '#94A3B8',
      500: '#64748B',
      600: '#475569',
      700: '#334155',
      800: '#1E293B',
      900: '#0F172A',
    },
    
    // Semantic
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },
  
  gradients: {
    // Primary brand gradient (yellow to gold)
    primary: 'linear-gradient(135deg, #FFD700 0%, #F7B928 50%, #E5A820 100%)',
    
    // Secondary gradient (blue spectrum)
    secondary: 'linear-gradient(135deg, #00D4FF 0%, #00A3FF 50%, #0080CC 100%)',
    
    // Glow effect gradient
    glow: 'linear-gradient(135deg, rgba(247, 185, 40, 0.4) 0%, rgba(0, 163, 255, 0.4) 100%)',
    
    // Card background with subtle gradient
    card: 'linear-gradient(180deg, rgba(22, 32, 50, 0.8) 0%, rgba(13, 27, 42, 0.9) 100%)',
    
    // Hero section gradient
    hero: 'radial-gradient(ellipse at center, rgba(0, 163, 255, 0.15) 0%, transparent 70%)',
    
    // Button hover glow
    buttonGlow: 'linear-gradient(135deg, #F7B928 0%, #FFD700 100%)',
    
    // Border gradient for cards
    border: 'linear-gradient(135deg, rgba(247, 185, 40, 0.5) 0%, rgba(0, 163, 255, 0.5) 100%)',
  },
  
  shadows: {
    // Glow shadows
    primaryGlow: '0 0 20px rgba(247, 185, 40, 0.3), 0 0 40px rgba(247, 185, 40, 0.1)',
    secondaryGlow: '0 0 20px rgba(0, 163, 255, 0.3), 0 0 40px rgba(0, 163, 255, 0.1)',
    accentGlow: '0 0 20px rgba(0, 212, 255, 0.3), 0 0 40px rgba(0, 212, 255, 0.1)',
    
    // Card shadows
    card: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
    cardHover: '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3)',
    
    // Elevated elements
    elevated: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
  },
  
  borders: {
    subtle: '1px solid rgba(255, 255, 255, 0.1)',
    medium: '1px solid rgba(255, 255, 255, 0.2)',
    primary: '1px solid rgba(247, 185, 40, 0.5)',
    secondary: '1px solid rgba(0, 163, 255, 0.5)',
    radius: {
      sm: '4px',
      md: '8px',
      lg: '12px',
      xl: '16px',
      full: '9999px',
    },
  },
  
  typography: {
    fontFamily: {
      sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      mono: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
      '5xl': '3rem',
    },
  },
  
  animation: {
    duration: {
      fast: '150ms',
      normal: '300ms',
      slow: '500ms',
    },
    easing: {
      default: 'cubic-bezier(0.4, 0, 0.2, 1)',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
      out: 'cubic-bezier(0, 0, 0.2, 1)',
      bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    },
  },
} as const;

// Tailwind CSS custom colors export
export const tailwindColors = {
  yellfi: {
    yellow: brand.colors.primary,
    blue: brand.colors.secondary,
    cyan: brand.colors.accent,
    dark: brand.colors.background,
  },
};

// CSS custom properties for runtime theming
export const cssVariables = `
  :root {
    --yellfi-primary: ${brand.colors.primary[500]};
    --yellfi-secondary: ${brand.colors.secondary[500]};
    --yellfi-accent: ${brand.colors.accent[500]};
    --yellfi-bg-primary: ${brand.colors.background.primary};
    --yellfi-bg-secondary: ${brand.colors.background.secondary};
    --yellfi-bg-card: ${brand.colors.background.card};
    --yellfi-glow-primary: ${brand.shadows.primaryGlow};
    --yellfi-glow-secondary: ${brand.shadows.secondaryGlow};
    --yellfi-gradient-primary: ${brand.gradients.primary};
    --yellfi-gradient-secondary: ${brand.gradients.secondary};
  }
`;

export type BrandColors = typeof brand.colors;
export type BrandGradients = typeof brand.gradients;
export type Brand = typeof brand;
