import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface MetricTileProps {
  label: string;
  value: string | number;
  change?: {
    value: number;
    isPositive: boolean;
  };
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function MetricTile({
  label,
  value,
  change,
  icon,
  size = 'md',
  className,
}: MetricTileProps) {
  const sizes = {
    sm: {
      container: 'p-3',
      label: 'text-xs',
      value: 'text-lg',
      change: 'text-xs',
    },
    md: {
      container: 'p-4',
      label: 'text-sm',
      value: 'text-2xl',
      change: 'text-sm',
    },
    lg: {
      container: 'p-6',
      label: 'text-base',
      value: 'text-3xl',
      change: 'text-base',
    },
  };

  const s = sizes[size];

  return (
    <div
      className={cn(
        'rounded-xl bg-yellfi-dark-card border border-white/10',
        'transition-all duration-200 hover:border-white/20',
        s.container,
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className={cn('text-neutral-400', s.label)}>{label}</p>
          <p className={cn('font-bold text-white', s.value)}>{value}</p>
          {change && (
            <p
              className={cn(
                'flex items-center gap-1',
                s.change,
                change.isPositive ? 'text-emerald-400' : 'text-red-400'
              )}
            >
              {change.isPositive ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              )}
              {Math.abs(change.value).toFixed(2)}%
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2 rounded-lg bg-yellfi-yellow-500/10 text-yellfi-yellow-500">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
