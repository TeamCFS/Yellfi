import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface GlowPanelProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'yellow' | 'blue' | 'gradient';
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function GlowPanel({
  children,
  className,
  variant = 'default',
  hover = true,
  padding = 'md',
}: GlowPanelProps) {
  const baseStyles = cn(
    'rounded-xl',
    'bg-yellfi-dark-card',
    'border border-white/10',
    'transition-all duration-300'
  );

  const variants = {
    default: cn(
      hover && 'hover:border-white/20 hover:shadow-card-hover'
    ),
    yellow: cn(
      'border-yellfi-yellow-500/20',
      hover && 'hover:border-yellfi-yellow-500/40 hover:shadow-glow-yellow'
    ),
    blue: cn(
      'border-yellfi-blue-500/20',
      hover && 'hover:border-yellfi-blue-500/40 hover:shadow-glow-blue'
    ),
    gradient: cn(
      'gradient-border',
      hover && 'hover:shadow-lg'
    ),
  };

  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4 md:p-6',
    lg: 'p-6 md:p-8',
  };

  return (
    <div className={cn(baseStyles, variants[variant], paddings[padding], className)}>
      {children}
    </div>
  );
}
