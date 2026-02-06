import { cn, shortenAddress, formatTimeAgo, formatEther } from '@/lib/utils';

export interface ExecutionEntry {
  id: string;
  agentId: number;
  ensName: string;
  ruleIndex: number;
  amountIn: bigint;
  amountOut: bigint;
  tokenIn: string;
  tokenOut: string;
  txHash: string;
  timestamp: bigint;
  success: boolean;
}

export interface ExecutionLogProps {
  entries: ExecutionEntry[];
  loading?: boolean;
  className?: string;
}

export function ExecutionLog({ entries, loading, className }: ExecutionLogProps) {
  if (loading) {
    return (
      <div className={cn('space-y-3', className)}>
        {[...Array(5)].map((_, i) => (
          <ExecutionEntrySkeleton key={i} />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center py-12 text-center',
          className
        )}
      >
        <div className="w-16 h-16 rounded-full bg-yellfi-dark-elevated flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-neutral-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <p className="text-neutral-400 font-medium">No executions yet</p>
        <p className="text-sm text-neutral-500 mt-1">
          Executions will appear here when agents trigger rules
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {entries.map((entry) => (
        <ExecutionEntryRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function ExecutionEntryRow({ entry }: { entry: ExecutionEntry }) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 p-3 rounded-lg',
        'bg-yellfi-dark-elevated border border-white/5',
        'hover:border-white/10 transition-colors'
      )}
    >
      {/* Status indicator */}
      <div
        className={cn(
          'w-2 h-2 rounded-full flex-shrink-0',
          entry.success ? 'bg-emerald-400' : 'bg-red-400'
        )}
      />

      {/* Agent info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">
            {entry.ensName}
          </span>
          <span className="text-xs text-neutral-500">Rule #{entry.ruleIndex}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-neutral-400">
            {formatEther(entry.amountIn)} {entry.tokenIn} → {formatEther(entry.amountOut)}{' '}
            {entry.tokenOut}
          </span>
        </div>
      </div>

      {/* Transaction link */}
      <a
        href={`https://sepolia.etherscan.io/tx/${entry.txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-yellfi-blue-400 hover:text-yellfi-blue-300 font-mono flex-shrink-0"
      >
        {shortenAddress(entry.txHash)}
      </a>

      {/* Timestamp */}
      <span className="text-xs text-neutral-500 flex-shrink-0">
        {formatTimeAgo(entry.timestamp)}
      </span>
    </div>
  );
}

function ExecutionEntrySkeleton() {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-yellfi-dark-elevated animate-pulse">
      <div className="w-2 h-2 rounded-full bg-white/10" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 bg-white/10 rounded" />
        <div className="h-3 w-48 bg-white/10 rounded" />
      </div>
      <div className="h-3 w-20 bg-white/10 rounded" />
      <div className="h-3 w-12 bg-white/10 rounded" />
    </div>
  );
}
