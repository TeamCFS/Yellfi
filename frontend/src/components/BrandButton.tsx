import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface BrandButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const BrandButton = forwardRef<HTMLButtonElement, BrandButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const baseStyles = cn(
      'inline-flex items-center justify-center font-medium transition-all duration-200',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellfi-yellow-500 focus-visible:ring-offset-2 focus-visible:ring-offset-yellfi-dark-primary',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      'active:scale-[0.98]'
    );

    const variants = {
      primary: cn(
        'bg-gradient-to-r from-yellfi-yellow-500 to-yellfi-yellow-400',
        'text-yellfi-dark-primary font-semibold',
        'hover:from-yellfi-yellow-400 hover:to-yellfi-yellow-300',
        'shadow-lg hover:shadow-glow-yellow',
        'border border-yellfi-yellow-400/50'
      ),
      secondary: cn(
        'bg-gradient-to-r from-yellfi-blue-500 to-yellfi-cyan-500',
        'text-white font-semibold',
        'hover:from-yellfi-blue-400 hover:to-yellfi-cyan-400',
        'shadow-lg hover:shadow-glow-blue',
        'border border-yellfi-blue-400/50'
      ),
      outline: cn(
        'bg-transparent',
        'text-yellfi-yellow-500',
        'border border-yellfi-yellow-500/50',
        'hover:bg-yellfi-yellow-500/10',
        'hover:border-yellfi-yellow-500'
      ),
      ghost: cn(
        'bg-transparent',
        'text-neutral-300',
        'hover:bg-white/5',
        'hover:text-white'
      ),
    };

    const sizes = {
      sm: 'h-8 px-3 text-sm rounded-md gap-1.5',
      md: 'h-10 px-4 text-sm rounded-lg gap-2',
      lg: 'h-12 px-6 text-base rounded-lg gap-2.5',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

BrandButton.displayName = 'BrandButton';
