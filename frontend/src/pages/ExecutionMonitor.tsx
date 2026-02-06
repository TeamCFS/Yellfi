import { useState, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { GlowPanel, ExecutionLog, MetricTile, HookSignalBadge, type ExecutionEntry, type SignalType } from '@/components';
import { cn, formatTimeAgo } from '@/lib/utils';
import { useWallet, useUserAgents } from '@/hooks';
import { CONTRACTS } from '@/config';
import { parseAbiItem } from 'viem';

interface TimelineEvent {
  id: string;
  type: 'execution' | 'signal' | 'deposit' | 'withdraw' | 'status_change';
  agentId: number;
  timestamp: number;
  data: {
    signal?: SignalType;
    magnitude?: number;
    amount?: string;
    txHash?: string;
    ruleIndex?: number;
    oldStatus?: string;
    newStatus?: string;
  };
}

const STATUS_MAP: Record<number, string> = {
  0: 'INACTIVE',
  1: 'ACTIVE',
  2: 'PAUSED',
  3: 'LIQUIDATED',
};

export function ExecutionMonitor() {
  const { isConnected } = useWallet();
  const { agentIds } = useUserAgents();
  const publicClient = usePublicClient();
  
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [executions, setExecutions] = useState<ExecutionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'executions' | 'signals' | 'deposits'>('all');
  const [selectedAgent, setSelectedAgent] = useState<number | 'all'>('all');

  // Fetch events from blockchain
  useEffect(() => {
    if (!publicClient || !isConnected) {
      setIsLoading(false);
      return;
    }

    const fetchEvents = async () => {
      setIsLoading(true);
      try {
        // Get the last 1000 blocks
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock > 1000n ? currentBlock - 1000n : 0n;

        // Fetch AgentExecuted events
        const executedLogs = await publicClient.getLogs({
          address: CONTRACTS.strategyAgent,
          event: parseAbiItem('event AgentExecuted(uint256 indexed agentId, bytes32 executionId, uint256 amountIn, uint256 amountOut)'),
          fromBlock,
          toBlock: 'latest',
        });

        // Fetch RuleTriggered events
        const triggeredLogs = await publicClient.getLogs({
          address: CONTRACTS.strategyAgent,
          event: parseAbiItem('event RuleTriggered(uint256 indexed agentId, uint256 ruleIndex, uint256 timestamp)'),
          fromBlock,
          toBlock: 'latest',
        });

        // Fetch AgentStatusChanged events
        const statusLogs = await publicClient.getLogs({
          address: CONTRACTS.strategyAgent,
          event: parseAbiItem('event AgentStatusChanged(uint256 indexed agentId, uint8 oldStatus, uint8 newStatus)'),
          fromBlock,
          toBlock: 'latest',
        });

        // Process events into timeline
        const events: TimelineEvent[] = [];

        for (const log of executedLogs) {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          events.push({
            id: `exec-${log.transactionHash}-${log.logIndex}`,
            type: 'execution',
            agentId: Number((log as any).args.agentId),
            timestamp: Number(block.timestamp),
            data: {
              txHash: log.transactionHash,
              amount: ((log as any).args.amountOut || 0n).toString(),
            },
          });
        }

        for (const log of triggeredLogs) {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          events.push({
            id: `trigger-${log.transactionHash}-${log.logIndex}`,
            type: 'signal',
            agentId: Number((log as any).args.agentId),
            timestamp: Number(block.timestamp),
            data: {
              ruleIndex: Number((log as any).args.ruleIndex),
              signal: 'REBALANCE_NEEDED' as SignalType,
              magnitude: 75,
            },
          });
        }

        for (const log of statusLogs) {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          events.push({
            id: `status-${log.transactionHash}-${log.logIndex}`,
            type: 'status_change',
            agentId: Number((log as any).args.agentId),
            timestamp: Number(block.timestamp),
            data: {
              oldStatus: STATUS_MAP[(log as any).args.oldStatus] || 'UNKNOWN',
              newStatus: STATUS_MAP[(log as any).args.newStatus] || 'UNKNOWN',
              txHash: log.transactionHash,
            },
          });
        }

        // Sort by timestamp descending
        events.sort((a, b) => b.timestamp - a.timestamp);
        setTimeline(events);

        // Convert to execution entries for the log component
        const execEntries: ExecutionEntry[] = events
          .filter(e => e.type === 'execution')
          .slice(0, 20)
          .map(e => ({
            id: e.id,
            agentId: e.agentId,
            ensName: `Agent #${e.agentId}`,
            ruleIndex: e.data.ruleIndex || 0,
            amountIn: BigInt(e.data.amount || '0'),
            amountOut: BigInt(e.data.amount || '0'),
            tokenIn: 'ETH',
            tokenOut: 'USDC',
            txHash: e.data.txHash || '',
            timestamp: BigInt(e.timestamp),
            success: true,
          }));
        setExecutions(execEntries);

      } catch (error) {
        console.error('Failed to fetch events:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
    
    // Poll for new events every 30 seconds
    const interval = setInterval(fetchEvents, 30000);
    return () => clearInterval(interval);
  }, [publicClient, isConnected]);

  const filteredTimeline = timeline.filter((event) => {
    if (selectedAgent !== 'all' && event.agentId !== selectedAgent) return false;
    if (filter === 'all') return true;
    if (filter === 'executions') return event.type === 'execution';
    if (filter === 'signals') return event.type === 'signal';
    if (filter === 'deposits') return event.type === 'deposit' || event.type === 'withdraw';
    return true;
  });

  const stats = {
    totalExecutions: timeline.filter(e => e.type === 'execution').length,
    totalSignals: timeline.filter(e => e.type === 'signal').length,
    activeAgents: new Set(timeline.map(e => e.agentId)).size,
  };

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Execution Monitor</h1>
        <GlowPanel className="py-12 text-center">
          <p className="text-neutral-400">Connect your wallet to view execution history</p>
        </GlowPanel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Execution Monitor</h1>
          <p className="text-neutral-400 mt-1">Real-time view of agent activities and hook signals</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="px-3 py-2 rounded-lg bg-yellfi-dark-elevated border border-white/10 text-white text-sm"
          >
            <option value="all">All Agents</option>
            {agentIds.map((id) => (
              <option key={id.toString()} value={Number(id)}>
                Agent #{id.toString()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricTile
          label="Total Executions"
          value={stats.totalExecutions.toString()}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <MetricTile
          label="Signals Received"
          value={stats.totalSignals.toString()}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          }
        />
        <MetricTile
          label="Active Agents"
          value={stats.activeAgents.toString()}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2">
          <GlowPanel>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Activity Timeline</h2>
              <div className="flex gap-2">
                {(['all', 'executions', 'signals', 'deposits'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                      filter === f
                        ? 'bg-yellfi-yellow-500 text-yellfi-dark-primary'
                        : 'bg-yellfi-dark-elevated text-neutral-400 hover:text-white'
                    )}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex gap-4">
                    <div className="w-10 h-10 bg-yellfi-dark-elevated rounded-full"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-yellfi-dark-elevated rounded w-1/3 mb-2"></div>
                      <div className="h-3 bg-yellfi-dark-elevated rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredTimeline.length === 0 ? (
              <div className="py-12 text-center text-neutral-500">
                <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>No activity yet</p>
                <p className="text-sm mt-1">Events will appear here when your agents execute</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {filteredTimeline.map((event) => (
                  <div
                    key={event.id}
                    className="flex gap-4 p-3 rounded-lg bg-yellfi-dark-elevated/50 hover:bg-yellfi-dark-elevated transition-colors"
                  >
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                        event.type === 'execution' && 'bg-emerald-500/20 text-emerald-400',
                        event.type === 'signal' && 'bg-yellfi-blue-500/20 text-yellfi-blue-400',
                        event.type === 'deposit' && 'bg-yellfi-yellow-500/20 text-yellfi-yellow-400',
                        event.type === 'withdraw' && 'bg-orange-500/20 text-orange-400',
                        event.type === 'status_change' && 'bg-purple-500/20 text-purple-400'
                      )}
                    >
                      {event.type === 'execution' && (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      )}
                      {event.type === 'signal' && (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      )}
                      {event.type === 'status_change' && (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">Agent #{event.agentId}</span>
                        {event.type === 'signal' && event.data.signal && (
                          <HookSignalBadge
                            type={event.data.signal}
                            magnitude={event.data.magnitude}
                          />
                        )}
                      </div>
                      <p className="text-sm text-neutral-400">
                        {event.type === 'execution' && 'Strategy executed successfully'}
                        {event.type === 'signal' && `Rule #${event.data.ruleIndex} triggered`}
                        {event.type === 'status_change' && `Status changed: ${event.data.oldStatus} → ${event.data.newStatus}`}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                        <span>{formatTimeAgo(event.timestamp * 1000)}</span>
                        {event.data.txHash && (
                          <a
                            href={`https://sepolia.etherscan.io/tx/${event.data.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-yellfi-blue-400 hover:underline"
                          >
                            View tx →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlowPanel>
        </div>

        {/* Execution Log */}
        <div className="lg:col-span-1">
          <GlowPanel>
            <h2 className="text-lg font-semibold text-white mb-4">Recent Executions</h2>
            {executions.length > 0 ? (
              <ExecutionLog entries={executions} />
            ) : (
              <div className="py-8 text-center text-neutral-500">
                <p className="text-sm">No executions recorded</p>
              </div>
            )}
          </GlowPanel>
        </div>
      </div>
    </div>
  );
}
