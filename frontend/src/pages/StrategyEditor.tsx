import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BrandButton, GlowPanel, StrategySlider, ENSBadge, HookSignalBadge } from '@/components';
import { cn } from '@/lib/utils';
import { 
  useAgent, 
  useAgentRules, 
  useUpdateRule, 
  useAddRule, 
  useRemoveRule,
  useWallet,
  RULE_TYPE_MAP,
  type Rule as ContractRule,
} from '@/hooks';

interface Rule {
  id: number;
  type: number;
  threshold: number;
  targetValue: number;
  cooldown: number;
  enabled: boolean;
  lastExecuted: number;
}

const ruleTypes = [
  { value: 0, label: 'Rebalance Threshold', description: 'Trigger when price moves by threshold' },
  { value: 1, label: 'Time Weighted', description: 'Execute at regular intervals' },
  { value: 3, label: 'Stop Loss', description: 'Exit position at loss threshold' },
  { value: 4, label: 'Take Profit', description: 'Take profit at target' },
  { value: 5, label: 'Hook Signal', description: 'React to Uniswap v4 hook signals' },
];

export function StrategyEditor() {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const { isConnected } = useWallet();
  
  const agentIdBigInt = agentId ? BigInt(agentId) : undefined;
  const { data: agent, isLoading: loadingAgent } = useAgent(agentIdBigInt);
  const { data: contractRules, isLoading: loadingRules, refetch: refetchRules } = useAgentRules(agentIdBigInt);
  
  const { updateRule: updateRuleContract, isPending: updatePending, isSuccess: updateSuccess } = useUpdateRule();
  const { addRule: addRuleContract, isPending: addPending, isSuccess: addSuccess } = useAddRule();
  const { removeRule: removeRuleContract, isPending: removePending, isSuccess: removeSuccess } = useRemoveRule();

  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedRule, setSelectedRule] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Convert contract rules to local state
  useEffect(() => {
    if (contractRules && contractRules.length > 0) {
      const localRules: Rule[] = contractRules.map((r: ContractRule, i: number) => ({
        id: i,
        type: r.ruleType,
        threshold: Number(r.threshold),
        targetValue: Number(r.targetValue),
        cooldown: Number(r.cooldown),
        enabled: r.enabled,
        lastExecuted: Number(r.lastExecuted),
      }));
      setRules(localRules);
      if (selectedRule === null && localRules.length > 0) {
        setSelectedRule(0);
      }
    }
  }, [contractRules]);

  // Refetch on successful operations
  useEffect(() => {
    if (updateSuccess || addSuccess || removeSuccess) {
      setTimeout(() => {
        refetchRules();
        setHasChanges(false);
      }, 2000);
    }
  }, [updateSuccess, addSuccess, removeSuccess, refetchRules]);

  const updateRule = (id: number, updates: Partial<Rule>) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    setHasChanges(true);
  };

  const addRule = () => {
    const newId = rules.length;
    const newRule: Rule = {
      id: newId,
      type: 0,
      threshold: 500,
      targetValue: 0,
      cooldown: 300,
      enabled: true,
      lastExecuted: 0,
    };
    setRules([...rules, newRule]);
    setSelectedRule(newId);
    setHasChanges(true);
  };

  const removeRule = (id: number) => {
    if (agentIdBigInt !== undefined) {
      removeRuleContract(agentIdBigInt, BigInt(id));
    }
  };

  const handleSave = async () => {
    if (!agentIdBigInt || selectedRule === null) return;
    
    const rule = rules[selectedRule];
    if (!rule) return;

    // Check if this is a new rule (id >= original contract rules length)
    const originalLength = contractRules?.length || 0;
    
    if (rule.id >= originalLength) {
      // Add new rule
      addRuleContract(agentIdBigInt, {
        ruleType: rule.type,
        threshold: BigInt(rule.threshold),
        targetValue: BigInt(rule.targetValue),
        cooldown: BigInt(rule.cooldown),
        lastExecuted: 0n,
        enabled: rule.enabled,
      });
    } else {
      // Update existing rule
      updateRuleContract(agentIdBigInt, BigInt(rule.id), {
        ruleType: rule.type,
        threshold: BigInt(rule.threshold),
        targetValue: BigInt(rule.targetValue),
        cooldown: BigInt(rule.cooldown),
        lastExecuted: BigInt(rule.lastExecuted),
        enabled: rule.enabled,
      });
    }
  };

  const selectedRuleData = selectedRule !== null ? rules[selectedRule] : null;
  const isLoading = loadingAgent || loadingRules;
  const isSaving = updatePending || addPending || removePending;

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto">
        <GlowPanel className="py-12 text-center">
          <p className="text-neutral-400">Please connect your wallet to edit strategies</p>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-white">Strategy Editor</h1>
            <ENSBadge 
              name={agent.ensName ? `${agent.ensName}.yellfi.eth` : `Agent #${agentId}`} 
              size="sm" 
            />
          </div>
          <p className="text-neutral-400">Agent #{agentId} - Configure automation rules</p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="text-sm text-yellfi-yellow-400">Unsaved changes</span>
          )}
          <BrandButton onClick={handleSave} loading={isSaving} disabled={!hasChanges}>
            Save Changes
          </BrandButton>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rules List */}
        <div className="lg:col-span-1">
          <GlowPanel padding="sm">
            <div className="flex items-center justify-between mb-4 px-2">
              <h2 className="font-semibold text-white">Rules ({rules.length})</h2>
              <button
                onClick={addRule}
                className="p-1.5 rounded-lg hover:bg-yellfi-yellow-500/10 text-yellfi-yellow-400 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            <div className="space-y-2">
              {rules.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-4">No rules configured</p>
              ) : (
                rules.map((rule, index) => (
                  <button
                    key={rule.id}
                    onClick={() => setSelectedRule(index)}
                    className={cn(
                      'w-full p-3 rounded-lg text-left transition-all',
                      'border',
                      selectedRule === index
                        ? 'bg-yellfi-yellow-500/10 border-yellfi-yellow-500/50'
                        : 'bg-yellfi-dark-elevated border-transparent hover:border-white/10'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full',
                            rule.enabled ? 'bg-emerald-400' : 'bg-neutral-500'
                          )}
                        />
                        <span className="text-sm font-medium text-white">
                          {ruleTypes.find((t) => t.value === rule.type)?.label || RULE_TYPE_MAP[rule.type]}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-500">#{index}</span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1 ml-4">
                      {rule.threshold / 100}% threshold, {rule.cooldown}s cooldown
                    </p>
                  </button>
                ))
              )}
            </div>
          </GlowPanel>
        </div>

        {/* Rule Editor */}
        <div className="lg:col-span-2">
          {selectedRuleData ? (
            <GlowPanel variant="gradient">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">
                  Edit Rule #{selectedRule}
                </h2>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRuleData.enabled}
                      onChange={(e) =>
                        updateRule(selectedRuleData.id, { enabled: e.target.checked })
                      }
                      className="w-4 h-4 rounded border-white/20 bg-yellfi-dark-primary text-yellfi-yellow-500 focus:ring-yellfi-yellow-500"
                    />
                    <span className="text-sm text-neutral-300">Enabled</span>
                  </label>
                  <button
                    onClick={() => removeRule(selectedRuleData.id)}
                    disabled={removePending}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-neutral-400 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {/* Rule Type */}
                <div>
                  <label className="text-sm font-medium text-neutral-300 mb-2 block">
                    Rule Type
                  </label>
                  <select
                    value={selectedRuleData.type}
                    onChange={(e) => updateRule(selectedRuleData.id, { type: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 rounded-lg bg-yellfi-dark-elevated border border-white/10 text-white focus:outline-none focus:border-yellfi-yellow-500/50"
                  >
                    {ruleTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-neutral-500 mt-1">
                    {ruleTypes.find((t) => t.value === selectedRuleData.type)?.description}
                  </p>
                </div>

                {/* Threshold */}
                <StrategySlider
                  label="Threshold (basis points)"
                  value={selectedRuleData.threshold}
                  onChange={(v) => updateRule(selectedRuleData.id, { threshold: v })}
                  min={10}
                  max={5000}
                  step={10}
                  description="Percentage threshold to trigger the rule (100 = 1%)"
                />

                {/* Target Value (for time-weighted) */}
                {selectedRuleData.type === 1 && (
                  <StrategySlider
                    label="Interval"
                    value={selectedRuleData.targetValue}
                    onChange={(v) => updateRule(selectedRuleData.id, { targetValue: v })}
                    min={60}
                    max={86400}
                    step={60}
                    unit="s"
                    description="Time interval between executions"
                  />
                )}

                {/* Hook Signal Type (for hook signal rules) */}
                {selectedRuleData.type === 5 && (
                  <div>
                    <label className="text-sm font-medium text-neutral-300 mb-2 block">
                      Signal Type
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['PRICE_IMPACT', 'LIQUIDITY_CHANGE', 'VOLATILITY_SPIKE', 'REBALANCE_NEEDED'].map(
                        (signal, idx) => (
                          <button
                            key={signal}
                            onClick={() =>
                              updateRule(selectedRuleData.id, { targetValue: idx })
                            }
                            className={cn(
                              'transition-all',
                              selectedRuleData.targetValue === idx
                                ? 'ring-2 ring-yellfi-yellow-500 ring-offset-2 ring-offset-yellfi-dark-primary rounded-full'
                                : ''
                            )}
                          >
                            <HookSignalBadge type={signal as any} showMagnitude={false} />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Cooldown */}
                <StrategySlider
                  label="Cooldown"
                  value={selectedRuleData.cooldown}
                  onChange={(v) => updateRule(selectedRuleData.id, { cooldown: v })}
                  min={60}
                  max={86400}
                  step={60}
                  unit="s"
                  description="Minimum time between rule executions"
                />

                {/* Last Executed */}
                {selectedRuleData.lastExecuted > 0 && (
                  <div className="p-4 rounded-lg bg-yellfi-dark-elevated border border-white/10">
                    <p className="text-sm text-neutral-400">Last Executed</p>
                    <p className="text-white font-medium">
                      {new Date(selectedRuleData.lastExecuted * 1000).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </GlowPanel>
          ) : (
            <GlowPanel className="flex items-center justify-center h-64">
              <p className="text-neutral-500">Select a rule to edit or add a new one</p>
            </GlowPanel>
          )}
        </div>
      </div>
    </div>
  );
}
