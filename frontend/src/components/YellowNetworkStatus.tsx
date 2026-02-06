import { useYellowNetwork } from '@/hooks';
import { cn } from '@/lib/utils';
import { BrandButton } from './BrandButton';

export interface YellowNetworkStatusProps {
  className?: string;
  showDetails?: boolean;
}

/**
 * Yellow Network connection status indicator
 * Shows state channel connection status and enables instant transactions
 */
export function YellowNetworkStatus({ 
  className,
  showDetails = false 
}: YellowNetworkStatusProps) {
  const { 
    status, 
    isConnected, 
    sessionId, 
    connect, 
    disconnect,
    error 
  } = useYellowNetwork();

  const statusColors = {
    disconnected: 'bg-neutral-500',
    connecting: 'bg-yellfi-yellow-500 animate-pulse',
    connected: 'bg-green-500',
    error: 'bg-red-500',
  };

  const statusLabels = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Connected',
    error: 'Error',
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <div className={cn(
          'w-2 h-2 rounded-full',
          statusColors[status]
        )} />
        <span className="text-sm text-neutral-400">
          Yellow Network: {statusLabels[status]}
        </span>
      </div>

      {/* Connect/Disconnect button */}
      {!isConnected ? (
        <BrandButton
          size="sm"
          variant="outline"
          onClick={connect}
          loading={status === 'connecting'}
        >
          Connect State Channel
        </BrandButton>
      ) : (
        <BrandButton
          size="sm"
          variant="ghost"
          onClick={disconnect}
        >
          Disconnect
        </BrandButton>
      )}

      {/* Details panel */}
      {showDetails && isConnected && (
        <div className="ml-4 text-xs text-neutral-500">
          {sessionId && (
            <span>Session: {sessionId.slice(0, 10)}...</span>
          )}
        </div>
      )}

      {/* Error display */}
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
}

/**
 * Compact Yellow Network badge for header
 */
export function YellowNetworkBadge({ className }: { className?: string }) {
  const { status, connect } = useYellowNetwork();

  const statusColors = {
    disconnected: 'border-neutral-600 text-neutral-500',
    connecting: 'border-yellfi-yellow-500/50 text-yellfi-yellow-400',
    connected: 'border-green-500/50 text-green-400',
    error: 'border-red-500/50 text-red-400',
  };

  const dotColors = {
    disconnected: 'bg-neutral-500',
    connecting: 'bg-yellfi-yellow-500 animate-pulse',
    connected: 'bg-green-500',
    error: 'bg-red-500',
  };

  return (
    <button
      onClick={status === 'disconnected' ? connect : undefined}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
        statusColors[status],
        status === 'disconnected' && 'hover:border-yellfi-yellow-500/50 hover:text-yellfi-yellow-400 cursor-pointer',
        className
      )}
    >
      <div className={cn('w-1.5 h-1.5 rounded-full', dotColors[status])} />
      <span>Yellow</span>
      {status === 'connected' && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )}
    </button>
  );
}
