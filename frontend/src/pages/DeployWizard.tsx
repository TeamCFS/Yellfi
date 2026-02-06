import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandButton, GlowPanel, StrategySlider, ENSBadge } from '@/components';
import { cn } from '@/lib/utils';
import { useCreateAgent, useIsNameAvailable, useWallet } from '@/hooks';

import type { Address } from 'viem';

type WizardStep = 'name' | 'pool' | 'rules' | 'confirm';

const steps: { id: WizardStep; label: string }[] = [
  { id: 'name', label: 'ENS Name' },
  { id: 'pool', label: 'Select Pool' },
  { id: 'rules', label: 'Configure Rules' },
  { id: 'confirm', label: 'Confirm' },
];

interface RuleConfig {
  type: number;
  threshold: number;
  targetValue: number;
  cooldown: number;
  enabled: boolean;
}

// Uniswap v4 contract addresses on Sepolia (for reference)
// PoolManager: 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543
// StateView: 0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c
// PositionManager: 0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4

// Common token addresses on Sepolia
const SEPOLIA_TOKENS = {
  WETH: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' as Address,
  USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
  DAI: '0x68194a729C2450ad26072b3D33ADaCbcef39D574' as Address,
  LINK: '0x779877A7B0D9E8603169DdbD7836e478b4624789' as Address,
};

// Predefined Uniswap v4 pools for Sepolia testnet
// Note: In v4, pools are identified by PoolKey (currency0, currency1, fee, tickSpacing, hooks)
const POOLS = [
  { 
    id: 'weth-usdc-3000', 
    name: 'WETH/USDC (0.3%)', 
    description: 'Standard fee tier for most pairs',
    fee: 3000, 
    tickSpacing: 60,
    currency0: SEPOLIA_TOKENS.USDC, // currency0 must be < currency1
    currency1: SEPOLIA_TOKENS.WETH,
  },
  { 
    id: 'weth-usdc-500', 
    name: 'WETH/USDC (0.05%)', 
    description: 'Low fee tier for stable pairs',
    fee: 500, 
    tickSpacing: 10,
    currency0: SEPOLIA_TOKENS.USDC,
    currency1: SEPOLIA_TOKENS.WETH,
  },
  { 
    id: 'weth-dai-3000', 
    name: 'WETH/DAI (0.3%)', 
    description: 'Standard fee tier',
    fee: 3000, 
    tickSpacing: 60,
    currency0: SEPOLIA_TOKENS.DAI,
    currency1: SEPOLIA_TOKENS.WETH,
  },
  { 
    id: 'weth-link-3000', 
    name: 'WETH/LINK (0.3%)', 
    description: 'Standard fee tier',
    fee: 3000, 
    tickSpacing: 60,
    currency0: SEPOLIA_TOKENS.LINK,
    currency1: SEPOLIA_TOKENS.WETH,
  },
  { 
    id: 'weth-usdc-10000', 
    name: 'WETH/USDC (1%)', 
    description: 'High fee tier for volatile pairs',
    fee: 10000, 
    tickSpacing: 200,
    currency0: SEPOLIA_TOKENS.USDC,
    currency1: SEPOLIA_TOKENS.WETH,
  },
];

const RULE_TYPES = [
  { 
    value: 0, 
    label: 'Rebalance Threshold', 
    description: 'Automatically rebalances when price moves by your set percentage',
    icon: '⚖️',
    beginner: true,
    tip: 'Great for maintaining balanced positions. Set threshold to 5% for moderate rebalancing.'
  },
  { 
    value: 1, 
    label: 'Time Weighted (DCA)', 
    description: 'Executes trades at regular time intervals',
    icon: '⏰',
    beginner: true,
    tip: 'Perfect for dollar-cost averaging. Set cooldown to 86400 for daily trades.'
  },
  { 
    value: 3, 
    label: 'Stop Loss', 
    description: 'Automatically exits position to limit losses',
    icon: '🛑',
    beginner: true,
    tip: 'Protects your investment. Set threshold to 10% to exit if price drops 10%.'
  },
  { 
    value: 4, 
    label: 'Take Profit', 
    description: 'Automatically takes profits at your target price',
    icon: '🎯',
    beginner: true,
    tip: 'Lock in gains automatically. Set threshold to 20% to take profit at 20% gain.'
  },
  { 
    value: 5, 
    label: 'Hook Signal', 
    description: 'Advanced: React to Uniswap v4 hook signals',
    icon: '🔗',
    beginner: false,
    tip: 'For advanced users. Responds to custom on-chain signals.'
  },
];

// Step descriptions for beginners
const STEP_DESCRIPTIONS = {
  name: {
    title: 'Choose Your Agent Name',
    description: 'Give your agent a unique name. This will be your agent\'s identity on the blockchain.',
    tip: 'Choose something memorable! Your agent will be accessible at [name].yellfi.eth'
  },
  pool: {
    title: 'Select Trading Pool',
    description: 'Choose which Uniswap v4 pool your agent will trade on.',
    tip: 'Start with WETH/USDC 0.3% - it\'s the most liquid and beginner-friendly option.'
  },
  rules: {
    title: 'Configure Trading Rules',
    description: 'Set up the automated rules that will trigger your agent\'s trades.',
    tip: 'Start with one simple rule like "Rebalance Threshold" at 5% to get familiar with how it works.'
  },
  review: {
    title: 'Review & Deploy',
    description: 'Review your configuration and deploy your agent to the blockchain.',
    tip: 'Double-check everything! Once deployed, you can still pause or modify rules.'
  }
};

// Helper to extract readable error message
function getErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error occurred';
  
  if (typeof error === 'object' && error !== null) {
    // Handle wagmi/viem errors
    const err = error as { 
      shortMessage?: string; 
      message?: string; 
      cause?: { message?: string; reason?: string; data?: { message?: string } };
      details?: string;
      metaMessages?: string[];
    };
    
    // Check for specific revert reasons
    if (err.cause?.reason) return `Contract error: ${err.cause.reason}`;
    if (err.cause?.data?.message) return `Contract error: ${err.cause.data.message}`;
    if (err.details) return err.details;
    if (err.metaMessages?.length) return err.metaMessages[0];
    if (err.shortMessage) return err.shortMessage;
    if (err.cause?.message) return err.cause.message;
    
    if (err.message) {
      // Clean up common error messages
      if (err.message.includes('User rejected')) return 'Transaction was rejected by user';
      if (err.message.includes('insufficient funds')) return 'Insufficient funds for gas';
      if (err.message.includes('execution reverted')) {
        // Try to extract the revert reason
        const reasonMatch = err.message.match(/reason: (.+?)(?:\n|$)/);
        if (reasonMatch) return `Contract error: ${reasonMatch[1]}`;
        
        // Check for common contract errors
        if (err.message.includes('ENS name taken')) return 'This ENS name is already taken';
        if (err.message.includes('Not authorized')) return 'Contract not authorized to perform this action';
        if (err.message.includes('Cooldown too short')) return 'Rule cooldown must be at least 60 seconds';
        if (err.message.includes('Invalid threshold')) return 'Rule threshold must be <= 10000 (100%)';
        
        return 'Transaction reverted. The ENS subname registration may have failed - ensure the contract has proper ENS permissions.';
      }
      return err.message.slice(0, 150);
    }
  }
  
  return String(error).slice(0, 150);
}

export function DeployWizard() {
  const navigate = useNavigate();
  const { isConnected, isWrongNetwork, expectedChainName } = useWallet();
  const [currentStep, setCurrentStep] = useState<WizardStep>('name');
  const [ensName, setEnsName] = useState('');
  const [selectedPool, setSelectedPool] = useState('');
  const [rules, setRules] = useState<RuleConfig[]>([
    { type: 0, threshold: 500, targetValue: 0, cooldown: 300, enabled: true },
  ]);
  const [localError, setLocalError] = useState<string | null>(null);

  const { data: isNameAvailable, isLoading: checkingName } = useIsNameAvailable(ensName);
  const { 
    createAgent, 
    isPending, 
    isConfirming, 
    isSuccess,
    isError,
    error,
    hash,
    reset,
  } = useCreateAgent();

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  // Navigate to dashboard on successful deployment
  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => navigate('/dashboard'), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, navigate]);

  // Clear local error when step changes
  useEffect(() => {
    setLocalError(null);
  }, [currentStep]);

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
      // Reset any errors when going back
      reset?.();
      setLocalError(null);
    }
  };

  const handleDeploy = async () => {
    setLocalError(null);
    
    if (!isConnected) {
      setLocalError('Please connect your wallet first');
      return;
    }

    if (isWrongNetwork) {
      setLocalError(`Please switch to ${expectedChainName} network`);
      return;
    }

    const pool = POOLS.find(p => p.id === selectedPool);
    if (!pool) {
      setLocalError('Please select a pool');
      return;
    }

    if (!ensName || ensName.length < 3) {
      setLocalError('Please enter a valid ENS name (at least 3 characters)');
      return;
    }

    const poolKey = {
      currency0: pool.currency0,
      currency1: pool.currency1,
      fee: pool.fee,
      tickSpacing: pool.tickSpacing,
      hooks: '0x0000000000000000000000000000000000000000' as Address, // No hook deployed yet
    };

    const formattedRules = rules.map(rule => ({
      ruleType: rule.type,
      threshold: BigInt(rule.threshold),
      targetValue: BigInt(rule.targetValue),
      cooldown: BigInt(rule.cooldown),
      lastExecuted: 0n,
      enabled: rule.enabled,
    }));

    try {
      await createAgent(ensName, poolKey, formattedRules);
    } catch (err) {
      console.error('Failed to deploy agent:', err);
      setLocalError(getErrorMessage(err));
    }
  };

  const handleRetry = () => {
    reset?.();
    setLocalError(null);
  };

  const addRule = () => {
    setRules([
      ...rules,
      { type: 1, threshold: 1000, targetValue: 3600, cooldown: 600, enabled: true },
    ]);
  };

  const updateRule = (index: number, updates: Partial<RuleConfig>) => {
    setRules(rules.map((r, i) => (i === index ? { ...r, ...updates } : r)));
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const canProceedFromName = ensName.length >= 3 && (isNameAvailable === true || isNameAvailable === undefined);
  const canProceedFromPool = !!selectedPool;
  const displayError = localError || (isError ? getErrorMessage(error) : null);
  const isProcessing = isPending || isConfirming;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Network Warning */}
      {isConnected && isWrongNetwork && (
        <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
          <div className="flex items-center gap-2 text-red-400">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm font-medium">
              Please switch to {expectedChainName} network to deploy your agent.
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Deploy Strategy Agent</h1>
        <p className="text-neutral-400 mt-1">
          Create an ENS-named agent to automate your DeFi strategies
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all',
                  index <= currentStepIndex
                    ? 'bg-yellfi-yellow-500 text-yellfi-dark-primary'
                    : 'bg-yellfi-dark-elevated text-neutral-500 border border-white/10'
                )}
              >
                {index < currentStepIndex ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'w-16 md:w-24 h-1 mx-2',
                    index < currentStepIndex ? 'bg-yellfi-yellow-500' : 'bg-yellfi-dark-elevated'
                  )}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {steps.map((step) => (
            <span
              key={step.id}
              className={cn(
                'text-xs',
                step.id === currentStep ? 'text-yellfi-yellow-400' : 'text-neutral-500'
              )}
            >
              {step.label}
            </span>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <GlowPanel variant="gradient" padding="lg">
        {currentStep === 'name' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">{STEP_DESCRIPTIONS.name.title}</h2>
              <p className="text-neutral-400 text-sm">
                {STEP_DESCRIPTIONS.name.description}
              </p>
            </div>

            {/* Beginner tip */}
            <div className="p-3 rounded-lg bg-yellfi-blue-500/10 border border-yellfi-blue-500/20">
              <p className="text-xs text-yellfi-blue-300">
                <span className="font-medium">💡 Tip:</span> {STEP_DESCRIPTIONS.name.tip}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">Agent Name</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ensName}
                  onChange={(e) => setEnsName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="my-agent"
                  className={cn(
                    'flex-1 px-4 py-3 rounded-lg',
                    'bg-yellfi-dark-elevated border border-white/10',
                    'text-white placeholder-neutral-500',
                    'focus:outline-none focus:border-yellfi-yellow-500/50',
                    'font-mono'
                  )}
                />
                <span className="text-neutral-400 font-mono">.yellfi.eth</span>
              </div>
              
              {ensName && (
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-sm text-neutral-400">Preview:</span>
                  <ENSBadge name={`${ensName}.yellfi.eth`} />
                  {checkingName && (
                    <span className="text-xs text-neutral-500">Checking availability...</span>
                  )}
                  {!checkingName && isNameAvailable === false && (
                    <span className="text-xs text-red-400">Name already taken</span>
                  )}
                  {!checkingName && isNameAvailable === true && (
                    <span className="text-xs text-green-400">Available!</span>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 rounded-lg bg-yellfi-blue-500/10 border border-yellfi-blue-500/20">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-yellfi-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-neutral-300">
                  <p className="font-medium text-yellfi-blue-400 mb-1">ENS Integration</p>
                  <p>Your agent will be registered as an ENS subname, making it easy to identify and interact with across the ecosystem.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'pool' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">{STEP_DESCRIPTIONS.pool.title}</h2>
              <p className="text-neutral-400 text-sm">
                {STEP_DESCRIPTIONS.pool.description}
              </p>
            </div>

            {/* Beginner tip */}
            <div className="p-3 rounded-lg bg-yellfi-blue-500/10 border border-yellfi-blue-500/20">
              <p className="text-xs text-yellfi-blue-300">
                <span className="font-medium">💡 Tip:</span> {STEP_DESCRIPTIONS.pool.tip}
              </p>
            </div>

            <div className="space-y-3">
              {POOLS.map((pool) => (
                <button
                  key={pool.id}
                  onClick={() => setSelectedPool(pool.id)}
                  className={cn(
                    'w-full p-4 rounded-lg text-left transition-all',
                    'border',
                    selectedPool === pool.id
                      ? 'bg-yellfi-yellow-500/10 border-yellfi-yellow-500/50'
                      : 'bg-yellfi-dark-elevated border-white/10 hover:border-white/20'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">{pool.name}</p>
                      <p className="text-xs text-neutral-500 mt-1">{pool.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-neutral-400">Tick Spacing: {pool.tickSpacing}</p>
                      <p className="text-xs text-neutral-500 mt-1">Fee: {pool.fee / 10000}%</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="p-4 rounded-lg bg-yellfi-blue-500/10 border border-yellfi-blue-500/20">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-yellfi-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-neutral-300">
                  <p className="font-medium text-yellfi-blue-400 mb-1">Uniswap v4 Pools</p>
                  <p>These are pre-configured Uniswap v4 pool configurations on Sepolia testnet. Your agent will monitor and execute trades on the selected pool.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'rules' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">{STEP_DESCRIPTIONS.rules.title}</h2>
              <p className="text-neutral-400 text-sm">
                {STEP_DESCRIPTIONS.rules.description}
              </p>
            </div>

            {/* Beginner tip */}
            <div className="p-3 rounded-lg bg-yellfi-blue-500/10 border border-yellfi-blue-500/20">
              <p className="text-xs text-yellfi-blue-300">
                <span className="font-medium">💡 Tip:</span> {STEP_DESCRIPTIONS.rules.tip}
              </p>
            </div>

            <div className="space-y-4">
              {rules.map((rule, index) => {
                const ruleTypeInfo = RULE_TYPES.find(rt => rt.value === rule.type);
                return (
                <div
                  key={index}
                  className="p-4 rounded-lg bg-yellfi-dark-elevated border border-white/10"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <select
                        value={rule.type}
                        onChange={(e) => updateRule(index, { type: parseInt(e.target.value) })}
                        className="px-3 py-1.5 rounded-lg bg-yellfi-dark-primary border border-white/10 text-white text-sm"
                      >
                        {RULE_TYPES.map(rt => (
                          <option key={rt.value} value={rt.value}>{rt.icon} {rt.label}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => updateRule(index, { enabled: e.target.checked })}
                          className="w-4 h-4 rounded border-white/20 bg-yellfi-dark-primary text-yellfi-yellow-500 focus:ring-yellfi-yellow-500"
                        />
                        <span className="text-sm text-neutral-400">Enabled</span>
                      </label>
                    </div>
                    {rules.length > 1 && (
                      <button
                        onClick={() => removeRule(index)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-neutral-400 hover:text-red-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Rule description */}
                  {ruleTypeInfo && (
                    <div className="mb-4 p-2 rounded bg-white/5 text-xs text-neutral-400">
                      <p>{ruleTypeInfo.description}</p>
                      {ruleTypeInfo.tip && (
                        <p className="mt-1 text-yellfi-yellow-400/80">💡 {ruleTypeInfo.tip}</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-4">
                    <StrategySlider
                      label="Threshold (%)"
                      value={rule.threshold}
                      onChange={(v) => updateRule(index, { threshold: v })}
                      min={10}
                      max={5000}
                      step={10}
                      description="Trigger when condition exceeds this value (100 = 1%)"
                    />
                    <StrategySlider
                      label="Cooldown"
                      value={rule.cooldown}
                      onChange={(v) => updateRule(index, { cooldown: v })}
                      min={60}
                      max={86400}
                      step={60}
                      unit="s"
                      description="Minimum time between executions"
                    />
                  </div>
                </div>
              );
              })}

              <button
                onClick={addRule}
                className="w-full p-3 rounded-lg border border-dashed border-white/20 text-neutral-400 hover:border-yellfi-yellow-500/50 hover:text-yellfi-yellow-400 transition-colors"
              >
                + Add Rule
              </button>
            </div>
          </div>
        )}

        {currentStep === 'confirm' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">Confirm Deployment</h2>
              <p className="text-neutral-400 text-sm">
                Review your agent configuration before deploying
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-yellfi-dark-elevated border border-white/10">
                <p className="text-sm text-neutral-400 mb-1">ENS Name</p>
                <ENSBadge name={`${ensName}.yellfi.eth`} size="lg" />
              </div>

              <div className="p-4 rounded-lg bg-yellfi-dark-elevated border border-white/10">
                <p className="text-sm text-neutral-400 mb-1">Pool</p>
                <p className="font-semibold text-white">
                  {POOLS.find(p => p.id === selectedPool)?.name || selectedPool}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-yellfi-dark-elevated border border-white/10">
                <p className="text-sm text-neutral-400 mb-2">Rules ({rules.length})</p>
                <div className="space-y-2">
                  {rules.map((rule, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-white">
                        {RULE_TYPES.find(rt => rt.value === rule.type)?.label}
                      </span>
                      <span className="text-neutral-400">
                        {rule.threshold / 100}% / {rule.cooldown}s cooldown
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transaction Status */}
              {isPending && (
                <div className="p-4 rounded-lg bg-yellfi-yellow-500/10 border border-yellfi-yellow-500/20">
                  <div className="flex gap-3 items-center">
                    <div className="w-5 h-5 border-2 border-yellfi-yellow-400 border-t-transparent rounded-full animate-spin" />
                    <div className="text-sm text-neutral-300">
                      <p className="font-medium text-yellfi-yellow-400">Waiting for wallet confirmation...</p>
                      <p>Please confirm the transaction in your wallet</p>
                    </div>
                  </div>
                </div>
              )}

              {isConfirming && hash && (
                <div className="p-4 rounded-lg bg-yellfi-blue-500/10 border border-yellfi-blue-500/20">
                  <div className="flex gap-3 items-center">
                    <div className="w-5 h-5 border-2 border-yellfi-blue-400 border-t-transparent rounded-full animate-spin" />
                    <div className="text-sm text-neutral-300">
                      <p className="font-medium text-yellfi-blue-400">Transaction submitted!</p>
                      <p>Waiting for confirmation on Sepolia...</p>
                      <a 
                        href={`https://sepolia.etherscan.io/tx/${hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-yellfi-blue-400 hover:underline mt-1 inline-block"
                      >
                        View on Etherscan →
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {isSuccess && (
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex gap-3">
                    <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div className="text-sm text-neutral-300">
                      <p className="font-medium text-green-400 mb-1">Agent Deployed Successfully!</p>
                      <p>Redirecting to dashboard in 3 seconds...</p>
                      {hash && (
                        <a 
                          href={`https://sepolia.etherscan.io/tx/${hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-yellfi-blue-400 hover:underline mt-1 inline-block"
                        >
                          View transaction →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {displayError && !isSuccess && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex gap-3">
                    <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-neutral-300 flex-1">
                      <p className="font-medium text-red-400 mb-1">Deployment Failed</p>
                      <p className="break-words">{displayError}</p>
                      <button
                        onClick={handleRetry}
                        className="text-yellfi-yellow-400 hover:underline mt-2 inline-block"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!isProcessing && !isSuccess && !displayError && (
                <div className="p-4 rounded-lg bg-yellfi-yellow-500/10 border border-yellfi-yellow-500/20">
                  <div className="flex gap-3">
                    <svg className="w-5 h-5 text-yellfi-yellow-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="text-sm text-neutral-300">
                      <p className="font-medium text-yellfi-yellow-400 mb-1">Ready to Deploy</p>
                      <p>This transaction will require gas on Sepolia testnet. Make sure you have enough SepoliaETH.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/10">
          <BrandButton
            variant="ghost"
            onClick={handleBack}
            disabled={currentStepIndex === 0 || isProcessing}
          >
            ← Back
          </BrandButton>

          {currentStep === 'confirm' ? (
            <BrandButton 
              onClick={handleDeploy} 
              loading={isProcessing}
              disabled={isSuccess || isProcessing}
            >
              {isPending ? 'Confirm in Wallet...' : 
               isConfirming ? 'Confirming...' : 
               isSuccess ? 'Deployed!' : 
               'Deploy Agent'}
            </BrandButton>
          ) : (
            <BrandButton
              onClick={handleNext}
              disabled={
                (currentStep === 'name' && !canProceedFromName) ||
                (currentStep === 'pool' && !canProceedFromPool)
              }
            >
              Continue →
            </BrandButton>
          )}
        </div>
      </GlowPanel>
    </div>
  );
}
