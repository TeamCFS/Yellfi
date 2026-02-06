import { cn } from '@/lib/utils';

export interface ENSBadgeProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export function ENSBadge({ name, size = 'md', showIcon = true, className }: ENSBadgeProps) {
  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full',
        'bg-gradient-to-r from-yellfi-blue-500/20 to-yellfi-cyan-500/20',
        'border border-yellfi-blue-500/30',
        'text-yellfi-cyan-400 font-mono font-medium',
        'transition-all duration-200',
        'hover:border-yellfi-blue-500/50 hover:shadow-glow-blue',
        sizes[size],
        className
      )}
    >
      {showIcon && (
        <svg
          className={cn('text-yellfi-blue-400', iconSizes[size])}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 2L2 7L12 12L22 7L12 2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M2 17L12 22L22 17"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M2 12L12 17L22 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <span>{name}</span>
    </div>
  );
}
