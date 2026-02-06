import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { parseEther, formatEther } from 'viem';
import { BrandButton, GlowPanel, ENSBadge, MetricTile } from '@/components';
import { cn, formatTimeAgo } from '@/lib/utils';
import { 
  useAgent, 
  useAgentRules, 
  useWallet,
  useDeposit,
  useWithdraw,
  usePauseAgent,
  useUnpauseAgent,
  useApproveToken,
  useTokenAllowance,
  useTokenBalance,
  useAgentTokenBalance,
  useExecutions,
  useBackendHealth,
  formatExecution,
  AGENT_STATUS_MAP,
  type AgentStatus,
} from '@/hooks';

// Rule type descriptions for beginners
const RULE_TYPE_INFO: Record<number, { name: string; description: string; icon: string }> = {
  0: { 
    name: 'Rebalance Threshold', 
    description: 'Automatically rebalances your position when price moves by the threshold percentage',
    icon: '⚖️'
  },
  1: { 
    name: 'Time Weighted', 
    description: 'Executes trades at regular time intervals (DCA strategy)',
    icon: '⏰'
  },
  2: { 
    name: 'Liquidity Range', 
    description: 'Adjusts your liquidity position range based on price movements',
    icon: '📊'
  },
  3: { 
    name: 'Stop Loss', 
    description: 'Automatically exits position if price drops below threshold to limit losses',
    icon: '🛑'
  },
  4: { 
    name: 'Take Profit', 
    description: 'Automatically takes profits when price reaches your target',
    icon: '🎯'
  },
  5: { 
    name: 'Custom Hook Signal', 
    description: 'Executes based on custom signals from Uniswap v4 hooks',
    icon: '🔗'
  },
};

import { CONTRACTS } from '@/config';

// Token options - WETH only for Sepolia
const TOKEN_OPTIONS = [
  { address: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', symbol: 'WETH', name: 'WETH (Sepolia)' },
] as const;

// WETH address constant
const WETH_ADDRESS = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' as const;

// Helper to format cooldown time
function formatCooldown(seconds: number): string {
  if (seconds < 0) return 'Now';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export function AgentDetail() {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const { isConnected, address } = useWallet();
  
  const agentIdBigInt = agentId ? BigInt(agentId) : undefined;
  const { data: agent, isLoading: loadingAgent, refetch } = useAgent(agentIdBigInt);
  const { data: rules, isLoading: loadingRules } = useAgentRules(agentIdBigInt);
  
  const { deposit, isPending: depositPending } = useDeposit();
  const { withdraw, isPending: withdrawPending } = useWithdraw();
  const { pauseAgent, isPending: pausePending } = usePauseAgent();
  const { unpauseAgent, isPending: unpausePending } = useUnpauseAgent();
  const { approve, isPending: approvePending } = useApproveToken();

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<string>(WETH_ADDRESS); // WETH only
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');

  // Check allowance for selected token
  const { data: allowance, refetch: refetchAllowance } = useTokenAllowance(
    selectedToken as `0x${string}`,
    address
  );

  // Get user's WETH balance
  const { data: tokenBalance } = useTokenBalance(
    selectedToken as `0x${string}`,
    address
  );

  // Get agent's balance for selected token
  const { data: agentTokenBalance } = useAgentTokenBalance(
    agentIdBigInt,
    selectedToken as `0x${string}`
  );

  // User's WETH balance
  const userBalance = tokenBalance || 0n;

  // Get token symbol
  const selectedTokenInfo = TOKEN_OPTIONS.find(t => t.address === selectedToken);
  const tokenSymbol = selectedTokenInfo?.symbol || 'Tokens';

  // Always need approval for WETH (ERC20)
  const needsApproval = depositAmount && 
    allowance !== undefined && 
    allowance < parseEther(depositAmount || '0');

  // Backend connection and execution history
  const { isConnected: backendConnected } = useBackendHealth();
  const { executions, isLoading: loadingExecutions } = useExecutions(agentId, 10);

  const isLoading = loadingAgent || loadingRules;
  const isOwner = agent && address && agent.owner.toLowerCase() === address.toLowerCase();
  const status = agent ? (AGENT_STATUS_MAP[agent.status] || 'INACTIVE') as AgentStatus : 'INACTIVE';
  const isPaused = status === 'PAUSED';

  const handleApprove = async () => {
    if (!selectedToken) return;
    try {
      await approve(selectedToken as `0x${string}`, CONTRACTS.strategyAgent as `0x${string}`);
      setTimeout(() => refetchAllowance(), 3000);
    } catch (error) {
      console.error('Approval failed:', error);
    }
  };

  const handleDeposit = async () => {
    if (!agentIdBigInt || !depositAmount) return;
    try {
      const amount = parseEther(depositAmount);
      await deposit(agentIdBigInt, selectedToken as `0x${string}`, amount);
      setDepositAmount('');
      setTimeout(() => refetch(), 3000);
    } catch (error) {
      console.error('Deposit failed:', error);
    }
  };

  const handleWithdraw = async () => {
    if (!agentIdBigInt || !withdrawAmount) return;
    try {
      const amount = parseEther(withdrawAmount);
      withdraw(agentIdBigInt, selectedToken as `0x${string}`, amount);
      setWithdrawAmount('');
      setTimeout(() => refetch(), 3000);
    } catch (error) {
      console.error('Withdraw failed:', error);
    }
  };

  const handlePauseToggle = async () => {
    if (!agentIdBigInt) return;
    try {
      if (isPaused) {
        unpauseAgent(agentIdBigInt);
      } else {
        pauseAgent(agentIdBigInt);
      }
      setTimeout(() => refetch(), 3000);
    } catch (error) {
      console.error('Pause/Unpause failed:', error);
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto">
        <GlowPanel className="py-12 text-center">
          <p className="text-neutral-400">Please connect your wallet to view agent details</p>
        </GlowPanel>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <GlowPanel className="py-12 text-center">
          <div className="animate-pulse">
            <div className="h-8 bg-yellfi-dark-elevated rounded w-48 mx-auto mb-4"></div>
            <div className="h-4 bg-yellfi-dark-elevated rounded w-64 mx-auto"></div>
          </div>
        </GlowPanel>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-4xl mx-auto">
        <GlowPanel className="py-12 text-center">
          <p className="text-neutral-400">Agent not found</p>
          <BrandButton className="mt-4" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </BrandButton>
        </GlowPanel>
      </div>
    );
  }

  const statusConfig: Record<AgentStatus, { label: string; color: string; dot: string }> = {
    INACTIVE: { label: 'Inactive', color: 'text-neutral-400', dot: 'bg-neutral-400' },
    ACTIVE: { label: 'Active', color: 'text-emerald-400', dot: 'bg-emerald-400 animate-pulse' },
    PAUSED: { label: 'Paused', color: 'text-yellfi-yellow-400', dot: 'bg-yellfi-yellow-400' },
    LIQUIDATED: { label: 'Liquidated', color: 'text-red-400', dot: 'bg-red-400' },
  };

  const statusInfo = statusConfig[status];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button 
              onClick={() => navigate('/dashboard')}
              className="p-2 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-white">Agent #{agentId}</h1>
            <ENSBadge 
              name={agent.ensName ? `${agent.ensName}.yellfi.eth` : `Agent #${agentId}`} 
              size="sm" 
            />
          </div>
          <div className="flex items-center gap-4 ml-10">
            <div className="flex items-center gap-2">
              <span className={cn('w-2 h-2 rounded-full', statusInfo.dot)} />
              <span className={cn('text-sm font-medium', statusInfo.color)}>
                {statusInfo.label}
              </span>
            </div>
            <span className="text-sm text-neutral-500">
              Last active {formatTimeAgo(agent.lastActivity)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isOwner && (
            <>
              <BrandButton 
                variant="ghost" 
                onClick={handlePauseToggle}
                loading={pausePending || unpausePending}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </BrandButton>
              <Link to={`/agent/${agentId}/edit`}>
                <BrandButton variant="outline">
                  Edit Rules
                </BrandButton>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricTile
          label="Deposited"
          value={`${formatEther(agent.depositedAmount)} ETH`}
        />
        <MetricTile
          label="Rules"
          value={String(rules?.length || 0)}
        />
        <MetricTile
          label="Created"
          value={new Date(Number(agent.createdAt) * 1000).toLocaleDateString()}
        />
        <MetricTile
          label="Executions"
          value="0"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deposit/Withdraw Panel */}
        <GlowPanel variant="gradient">
          <h2 className="text-lg font-semibold text-white mb-4">Manage Funds</h2>
          
          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab('deposit')}
              className={cn(
                'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all',
                activeTab === 'deposit'
                  ? 'bg-yellfi-yellow-500/20 text-yellfi-yellow-400 border border-yellfi-yellow-500/50'
                  : 'bg-yellfi-dark-elevated text-neutral-400 border border-transparent hover:border-white/10'
              )}
            >
              Deposit
            </button>
            <button
              onClick={() => setActiveTab('withdraw')}
              className={cn(
                'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all',
                activeTab === 'withdraw'
                  ? 'bg-yellfi-yellow-500/20 text-yellfi-yellow-400 border border-yellfi-yellow-500/50'
                  : 'bg-yellfi-dark-elevated text-neutral-400 border border-transparent hover:border-white/10'
              )}
            >
              Withdraw
            </button>
          </div>

          {activeTab === 'deposit' ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-neutral-400">Token</label>
                  <span className="text-xs text-neutral-500">
                    Balance: {formatEther(userBalance)} {tokenSymbol}
                  </span>
                </div>
                <select
                  value={selectedToken}
                  onChange={(e) => setSelectedToken(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-yellfi-dark-elevated border border-white/10 text-white focus:outline-none focus:border-yellfi-yellow-500/50"
                >
                  {TOKEN_OPTIONS.map((token) => (
                    <option key={token.address} value={token.address}>
                      {token.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-neutral-400">Amount</label>
                  <button
                    type="button"
                    onClick={() => setDepositAmount(formatEther(userBalance))}
                    className="text-xs text-yellfi-yellow-400 hover:text-yellfi-yellow-300"
                  >
                    Max
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.0"
                    step="0.001"
                    min="0"
                    className="w-full px-4 py-3 rounded-lg bg-yellfi-dark-elevated border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:border-yellfi-yellow-500/50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500">
                    {tokenSymbol}
                  </span>
                </div>
              </div>
              {needsApproval ? (
                <BrandButton 
                  className="w-full" 
                  onClick={handleApprove}
                  loading={approvePending}
                  disabled={!depositAmount || parseFloat(depositAmount) <= 0}
                >
                  Approve {tokenSymbol}
                </BrandButton>
              ) : (
                <BrandButton 
                  className="w-full" 
                  onClick={handleDeposit}
                  loading={depositPending}
                  disabled={!depositAmount || parseFloat(depositAmount) <= 0}
                >
                  Deposit {tokenSymbol}
                </BrandButton>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-neutral-400">Token</label>
                  <span className="text-xs text-neutral-500">
                    Agent Balance: {formatEther(agentTokenBalance || 0n)} {tokenSymbol}
                  </span>
                </div>
                <select
                  value={selectedToken}
                  onChange={(e) => setSelectedToken(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-yellfi-dark-elevated border border-white/10 text-white focus:outline-none focus:border-yellfi-yellow-500/50"
                >
                  {TOKEN_OPTIONS.map((token) => (
                    <option key={token.address} value={token.address}>
                      {token.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-neutral-400">Amount</label>
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(formatEther(agentTokenBalance || 0n))}
                    className="text-xs text-yellfi-yellow-400 hover:text-yellfi-yellow-300"
                  >
                    Max
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.0"
                    step="0.001"
                    min="0"
                    className="w-full px-4 py-3 rounded-lg bg-yellfi-dark-elevated border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:border-yellfi-yellow-500/50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500">
                    {tokenSymbol}
                  </span>
                </div>
              </div>
              {!isOwner && (
                <p className="text-sm text-red-400">Only the agent owner can withdraw funds</p>
              )}
              <BrandButton 
                className="w-full" 
                onClick={handleWithdraw}
                loading={withdrawPending}
                disabled={!isOwner || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
              >
                Withdraw {tokenSymbol}
              </BrandButton>
            </div>
          )}
        </GlowPanel>

        {/* Rules Summary */}
        <GlowPanel>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Strategy Rules</h2>
            {isOwner && (
              <Link to={`/agent/${agentId}/edit`}>
                <BrandButton variant="ghost" size="sm">
                  Manage
                </BrandButton>
              </Link>
            )}
          </div>

          {/* Beginner tip */}
          <div className="mb-4 p-3 rounded-lg bg-yellfi-blue-500/10 border border-yellfi-blue-500/20">
            <p className="text-xs text-yellfi-blue-300">
              <span className="font-medium">💡 Tip:</span> Rules define when your agent automatically executes trades. 
              Green status means the rule is ready to execute when conditions are met.
            </p>
          </div>
          
          {rules && rules.length > 0 ? (
            <div className="space-y-3">
              {rules.map((rule, index) => {
                const ruleInfo = RULE_TYPE_INFO[Number(rule.ruleType)] || { 
                  name: `Rule Type ${rule.ruleType}`, 
                  description: 'Custom rule type',
                  icon: '📋'
                };
                const cooldownSeconds = Number(rule.cooldown);
                const lastExecuted = Number(rule.lastExecuted);
                const now = Math.floor(Date.now() / 1000);
                const nextExecutionTime = lastExecuted + cooldownSeconds;
                const canExecuteNow = rule.enabled && now >= nextExecutionTime;
                const timeUntilExecution = nextExecutionTime - now;

                return (
                  <div 
                    key={index}
                    className={cn(
                      'p-4 rounded-lg border transition-all',
                      canExecuteNow 
                        ? 'bg-emerald-500/10 border-emerald-500/30' 
                        : 'bg-yellfi-dark-elevated border-white/10'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{ruleInfo.icon}</span>
                        <div>
                          <p className="font-medium text-white">{ruleInfo.name}</p>
                          <p className="text-xs text-neutral-400 mt-1">{ruleInfo.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {canExecuteNow ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Ready to Execute
                          </span>
                        ) : rule.enabled ? (
                          <span className="text-xs px-2 py-1 rounded bg-yellfi-yellow-500/20 text-yellfi-yellow-400">
                            Cooldown: {formatCooldown(timeUntilExecution)}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded bg-neutral-500/20 text-neutral-400">
                            Disabled
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-neutral-500">Threshold</p>
                        <p className="text-sm text-white font-medium">{Number(rule.threshold) / 100}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500">Cooldown Period</p>
                        <p className="text-sm text-white font-medium">{formatCooldown(cooldownSeconds)}</p>
                      </div>
                      {lastExecuted > 0 && (
                        <div className="col-span-2">
                          <p className="text-xs text-neutral-500">Last Executed</p>
                          <p className="text-sm text-white">{new Date(lastExecuted * 1000).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-neutral-400 mb-2">No rules configured yet</p>
              <p className="text-xs text-neutral-500 mb-4">Add rules to automate your trading strategy</p>
              {isOwner && (
                <Link to={`/agent/${agentId}/edit`}>
                  <BrandButton variant="outline" size="sm">
                    Add Your First Rule
                  </BrandButton>
                </Link>
              )}
            </div>
          )}
        </GlowPanel>
      </div>

      {/* Execution History */}
      <GlowPanel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Execution History</h2>
          <div className="flex items-center gap-2">
            <span className={cn(
              'w-2 h-2 rounded-full',
              backendConnected ? 'bg-emerald-400' : 'bg-red-400'
            )} />
            <span className="text-xs text-neutral-400">
              {backendConnected ? 'Backend Connected' : 'Backend Offline'}
            </span>
          </div>
        </div>

        {!backendConnected ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🔌</div>
            <p className="text-neutral-400 mb-2">Backend service not connected</p>
            <p className="text-xs text-neutral-500">
              Start the backend service to see execution history and enable automated trading.
            </p>
            <div className="mt-4 p-3 rounded-lg bg-yellfi-dark-elevated text-left">
              <p className="text-xs text-neutral-400 mb-2">To start the backend:</p>
              <code className="text-xs text-yellfi-yellow-400 font-mono">
                cd backend && npm run dev
              </code>
            </div>
          </div>
        ) : loadingExecutions ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-yellfi-dark-elevated rounded-lg" />
            ))}
          </div>
        ) : executions.length > 0 ? (
          <div className="space-y-3">
            {executions.map((execution) => {
              const formatted = formatExecution(execution);
              return (
                <div 
                  key={execution.id}
                  className={cn(
                    'p-3 rounded-lg border',
                    formatted.status === 'success' 
                      ? 'bg-emerald-500/5 border-emerald-500/20' 
                      : 'bg-red-500/5 border-red-500/20'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        'w-2 h-2 rounded-full',
                        formatted.status === 'success' ? 'bg-emerald-400' : 'bg-red-400'
                      )} />
                      <div>
                        <p className="text-sm font-medium text-white">{formatted.ruleType}</p>
                        <p className="text-xs text-neutral-400">{formatted.time}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={cn(
                        'text-xs px-2 py-1 rounded',
                        execution.executionMode === 'state-channel'
                          ? 'bg-yellfi-yellow-500/20 text-yellfi-yellow-400'
                          : 'bg-yellfi-blue-500/20 text-yellfi-blue-400'
                      )}>
                        {formatted.mode}
                      </span>
                      {execution.transactionHash && (
                        <a 
                          href={`https://sepolia.etherscan.io/tx/${execution.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-neutral-500 hover:text-white mt-1"
                        >
                          View tx →
                        </a>
                      )}
                    </div>
                  </div>
                  {execution.error && (
                    <p className="mt-2 text-xs text-red-400">{execution.error}</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-neutral-400 mb-2">No executions yet</p>
            <p className="text-xs text-neutral-500">
              Executions will appear here when your agent's rules are triggered.
            </p>
          </div>
        )}
      </GlowPanel>

      {/* Agent Info */}
      <GlowPanel>
        <h2 className="text-lg font-semibold text-white mb-4">Agent Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-yellfi-dark-elevated">
            <p className="text-sm text-neutral-400 mb-1">Owner</p>
            <p className="text-white font-mono text-sm break-all">{agent.owner}</p>
          </div>
          <div className="p-4 rounded-lg bg-yellfi-dark-elevated">
            <p className="text-sm text-neutral-400 mb-1">ENS Name</p>
            <p className="text-white">{agent.ensName ? `${agent.ensName}.yellfi.eth` : 'Not set'}</p>
          </div>
          <div className="p-4 rounded-lg bg-yellfi-dark-elevated">
            <p className="text-sm text-neutral-400 mb-1">Pool Fee</p>
            <p className="text-white">{Number(agent.poolKey.fee) / 10000}%</p>
          </div>
          <div className="p-4 rounded-lg bg-yellfi-dark-elevated">
            <p className="text-sm text-neutral-400 mb-1">Tick Spacing</p>
            <p className="text-white">{Number(agent.poolKey.tickSpacing)}</p>
          </div>
        </div>
      </GlowPanel>
    </div>
  );
}
