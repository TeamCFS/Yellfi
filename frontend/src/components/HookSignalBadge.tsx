import { cn } from '@/lib/utils';

export type SignalType =
  | 'PRICE_IMPACT'
  | 'LIQUIDITY_CHANGE'
  | 'VOLATILITY_SPIKE'
  | 'ARBITRAGE_OPPORTUNITY'
  | 'REBALANCE_NEEDED';

export interface HookSignalBadgeProps {
  type: SignalType;
  magnitude?: number;
  timestamp?: number;
  size?: 'sm' | 'md';
  showMagnitude?: boolean;
  className?: string;
}

const signalConfig: Record<
  SignalType,
  { label: string; color: string; bgColor: string; icon: string }
> = {
  PRICE_IMPACT: {
    label: 'Price Impact',
    color: 'text-yellfi-yellow-400',
    bgColor: 'bg-yellfi-yellow-500/10 border-yellfi-yellow-500/30',
    icon: '📊',
  },
  LIQUIDITY_CHANGE: {
    label: 'Liquidity',
    color: 'text-yellfi-blue-400',
    bgColor: 'bg-yellfi-blue-500/10 border-yellfi-blue-500/30',
    icon: '💧',
  },
  VOLATILITY_SPIKE: {
    label: 'Volatility',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/30',
    icon: '⚡',
  },
  ARBITRAGE_OPPORTUNITY: {
    label: 'Arbitrage',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/30',
    icon: '🔄',
  },
  REBALANCE_NEEDED: {
    label: 'Rebalance',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/30',
    icon: '⚖️',
  },
};

export function HookSignalBadge({
  type,
  magnitude,
  size = 'md',
  showMagnitude = true,
  className,
}: HookSignalBadgeProps) {
  const config = signalConfig[type];

  const sizes = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-sm px-3 py-1 gap-1.5',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border',
        'font-medium transition-all duration-200',
        config.bgColor,
        config.color,
        sizes[size],
        className
      )}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
      {showMagnitude && magnitude !== undefined && (
        <span className="opacity-75">({(magnitude / 100).toFixed(2)}%)</span>
      )}
    </div>
  );
}
