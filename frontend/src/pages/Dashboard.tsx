import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  AgentCard,
  AgentCardSkeleton,
  MetricTile,
  ExecutionLog,
  BrandButton,
  GlowPanel,
  type AgentStatus,
  type ExecutionEntry,
} from '@/components';
import { 
  useWallet, 
  useUserAgents,
  useAgent,
  useAgentRules,
  useTotalAgents,
  usePauseAgent,
  useUnpauseAgent,
  AGENT_STATUS_MAP,
} from '@/hooks';

// Component to fetch and display a single agent
function AgentCardWithData({ 
  agentId, 
  onPause,
  onUnpause,
  onView,
}: { 
  agentId: bigint; 
  onPause: (id: bigint) => void;
  onUnpause: (id: bigint) => void;
  onView: (id: bigint) => void;
}) {
  const { data: agent, isLoading } = useAgent(agentId);
  const { data: rules } = useAgentRules(agentId);

  if (isLoading || !agent) {
    return <AgentCardSkeleton />;
  }

  const status = AGENT_STATUS_MAP[agent.status] || 'INACTIVE';
  const isPaused = status === 'PAUSED';

  return (
    <AgentCard
      id={Number(agentId)}
      ensName={agent.ensName ? `${agent.ensName}.yellfi.eth` : `Agent #${agentId}`}
      status={status as AgentStatus}
      depositedAmount={agent.depositedAmount}
      rulesCount={rules?.length || 0}
      lastActivity={agent.lastActivity}
      onView={() => onView(agentId)}
      onPause={() => isPaused ? onUnpause(agentId) : onPause(agentId)}
    />
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { isConnected, isWrongNetwork, expectedChainName, switchToSepolia, isSwitching } = useWallet();
  const { data: totalAgentsData, isLoading: loadingTotal } = useTotalAgents();
  const { agentIds, isLoading: loadingUserAgents, hasAgents, refetch } = useUserAgents();
  const { pauseAgent } = usePauseAgent();
  const { unpauseAgent } = useUnpauseAgent();
  
  // For execution log - we'll fetch from events in a real implementation
  const [executions] = useState<ExecutionEntry[]>([]);

  const totalAgents = totalAgentsData ? Number(totalAgentsData) : 0;
  const loading = loadingTotal || loadingUserAgents;

  const handleViewAgent = (agentId: bigint) => {
    navigate(`/agent/${agentId}`);
  };

  const handlePauseAgent = async (agentId: bigint) => {
    try {
      pauseAgent(agentId);
      // Refetch after transaction
      setTimeout(() => refetch(), 2000);
    } catch (error) {
      console.error('Failed to pause agent:', error);
    }
  };

  const handleUnpauseAgent = async (agentId: bigint) => {
    try {
      unpauseAgent(agentId);
      setTimeout(() => refetch(), 2000);
    } catch (error) {
      console.error('Failed to unpause agent:', error);
    }
  };

  return (
    <div className="space-y-8">
      {/* Network Warning */}
      {isConnected && isWrongNetwork && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-400">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-medium">
                Wrong network detected. Please switch to {expectedChainName} to use YellFi.
              </span>
            </div>
            <button
              onClick={switchToSepolia}
              disabled={isSwitching}
              className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isSwitching ? 'Switching...' : `Switch to ${expectedChainName}`}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-neutral-400 mt-1">
            {isConnected 
              ? 'Monitor and manage your strategy agents'
              : 'Connect your wallet to view your agents'
            }
          </p>
        </div>
        <Link to="/deploy">
          <BrandButton size="lg">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Deploy Agent
          </BrandButton>
        </Link>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Total Agents (Network)"
          value={loading ? '...' : totalAgents.toString()}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          }
        />
        <MetricTile
          label="Your Agents"
          value={loading ? '...' : agentIds.length.toString()}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          }
        />
        <MetricTile
          label="Contract"
          value="Active"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <MetricTile
          label="Network"
          value="Sepolia"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
              />
            </svg>
          }
        />
      </div>

      {/* Agents Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Your Agents</h2>
          {hasAgents && (
            <Link to="/agents" className="text-sm text-yellfi-yellow-400 hover:text-yellfi-yellow-300">
              View all →
            </Link>
          )}
        </div>
        
        {!isConnected ? (
          <GlowPanel className="py-12 text-center">
            <svg className="w-12 h-12 mx-auto text-neutral-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-neutral-400 mb-4">Connect your wallet to view your agents</p>
          </GlowPanel>
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AgentCardSkeleton />
            <AgentCardSkeleton />
            <AgentCardSkeleton />
          </div>
        ) : !hasAgents ? (
          <GlowPanel className="py-12 text-center">
            <svg className="w-12 h-12 mx-auto text-neutral-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-neutral-400 mb-4">You don't have any agents yet</p>
            <Link to="/deploy">
              <BrandButton>Deploy Your First Agent</BrandButton>
            </Link>
          </GlowPanel>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agentIds.slice(0, 6).map((agentId) => (
              <AgentCardWithData 
                key={agentId.toString()} 
                agentId={agentId}
                onPause={handlePauseAgent}
                onUnpause={handleUnpauseAgent}
                onView={handleViewAgent}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent Executions */}
      <GlowPanel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Recent Executions</h2>
          <Link
            to="/executions"
            className="text-sm text-yellfi-yellow-400 hover:text-yellfi-yellow-300"
          >
            View all →
          </Link>
        </div>
        {executions.length > 0 ? (
          <ExecutionLog entries={executions} />
        ) : (
          <div className="py-8 text-center text-neutral-500">
            <svg className="w-10 h-10 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p>No executions yet</p>
            <p className="text-sm mt-1">Executions will appear here when your agents trigger rules</p>
          </div>
        )}
      </GlowPanel>
    </div>
  );
}
