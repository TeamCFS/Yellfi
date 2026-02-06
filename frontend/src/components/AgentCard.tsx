import { cn, formatEther, formatTimeAgo } from '@/lib/utils';
import { ENSBadge } from './ENSBadge';
import { HookSignalBadge, type SignalType } from './HookSignalBadge';
import { GlowPanel } from './GlowPanel';
import { BrandButton } from './BrandButton';

export type AgentStatus = 'INACTIVE' | 'ACTIVE' | 'PAUSED' | 'LIQUIDATED';

export interface AgentCardProps {
  id: number;
  ensName: string;
  status: AgentStatus;
  depositedAmount: bigint;
  rulesCount: number;
  lastActivity: bigint;
  latestSignal?: {
    type: SignalType;
    magnitude: number;
  };
  onView?: () => void;
  onPause?: () => void;
  className?: string;
}

const statusConfig: Record<AgentStatus, { label: string; color: string; dot: string }> = {
  INACTIVE: {
    label: 'Inactive',
    color: 'text-neutral-400',
    dot: 'bg-neutral-400',
  },
  ACTIVE: {
    label: 'Active',
    color: 'text-emerald-400',
    dot: 'bg-emerald-400 animate-pulse',
  },
  PAUSED: {
    label: 'Paused',
    color: 'text-yellfi-yellow-400',
    dot: 'bg-yellfi-yellow-400',
  },
  LIQUIDATED: {
    label: 'Liquidated',
    color: 'text-red-400',
    dot: 'bg-red-400',
  },
};

export function AgentCard({
  id,
  ensName,
  status,
  depositedAmount,
  rulesCount,
  lastActivity,
  latestSignal,
  onView,
  onPause,
  className,
}: AgentCardProps) {
  const statusInfo = statusConfig[status];

  return (
    <GlowPanel
      variant={status === 'ACTIVE' ? 'yellow' : 'default'}
      className={cn('group', className)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 font-mono">#{id}</span>
            <ENSBadge name={ensName} size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('w-2 h-2 rounded-full', statusInfo.dot)} />
            <span className={cn('text-sm font-medium', statusInfo.color)}>
              {statusInfo.label}
            </span>
          </div>
        </div>

        {/* Robot Icon */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellfi-yellow-500/20 to-yellfi-blue-500/20 flex items-center justify-center border border-white/10 group-hover:border-yellfi-yellow-500/30 transition-colors">
          <svg
            className="w-6 h-6 text-yellfi-yellow-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-neutral-500 mb-1">Deposited</p>
          <p className="text-lg font-semibold text-white">
            {formatEther(depositedAmount)} ETH
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 mb-1">Rules</p>
          <p className="text-lg font-semibold text-white">{rulesCount}</p>
        </div>
      </div>

      {/* Latest Signal */}
      {latestSignal && (
        <div className="mb-4">
          <p className="text-xs text-neutral-500 mb-2">Latest Signal</p>
          <HookSignalBadge type={latestSignal.type} magnitude={latestSignal.magnitude} size="sm" />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <span className="text-xs text-neutral-500">
          Last active {formatTimeAgo(lastActivity)}
        </span>
        <div className="flex gap-2">
          {status === 'ACTIVE' && onPause && (
            <BrandButton variant="ghost" size="sm" onClick={onPause}>
              Pause
            </BrandButton>
          )}
          {status === 'PAUSED' && onPause && (
            <BrandButton variant="ghost" size="sm" onClick={onPause}>
              Resume
            </BrandButton>
          )}
          {onView && (
            <BrandButton variant="outline" size="sm" onClick={onView}>
              View
            </BrandButton>
          )}
        </div>
      </div>
    </GlowPanel>
  );
}

// Skeleton loader for AgentCard
export function AgentCardSkeleton() {
  return (
    <GlowPanel className="animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-2">
          <div className="h-5 w-32 bg-white/10 rounded" />
          <div className="h-4 w-16 bg-white/10 rounded" />
        </div>
        <div className="w-12 h-12 bg-white/10 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="h-3 w-16 bg-white/10 rounded mb-2" />
          <div className="h-6 w-24 bg-white/10 rounded" />
        </div>
        <div>
          <div className="h-3 w-12 bg-white/10 rounded mb-2" />
          <div className="h-6 w-8 bg-white/10 rounded" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <div className="h-3 w-24 bg-white/10 rounded" />
        <div className="h-8 w-16 bg-white/10 rounded" />
      </div>
    </GlowPanel>
  );
}
