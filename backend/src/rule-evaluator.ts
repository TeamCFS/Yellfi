import {
  type Address,
  type PublicClient,
} from 'viem';
import { StrategyAgentABI, YellFiHookABI } from './abis/index.js';
import { createChildLogger } from './logger.js';
import { createRobustPublicClient } from './rpc-client.js';
import type { Config } from './config.js';
import type { HookSignal } from './event-listener.js';

const logger = createChildLogger('rule-evaluator');

export enum RuleType {
  REBALANCE_THRESHOLD = 0,
  TIME_WEIGHTED = 1,
  LIQUIDITY_RANGE = 2,
  STOP_LOSS = 3,
  TAKE_PROFIT = 4,
  CUSTOM_HOOK_SIGNAL = 5,
}

export enum SignalType {
  PRICE_IMPACT = 0,
  LIQUIDITY_CHANGE = 1,
  VOLATILITY_SPIKE = 2,
  ARBITRAGE_OPPORTUNITY = 3,
  REBALANCE_NEEDED = 4,
}

export interface Rule {
  ruleType: RuleType;
  threshold: bigint;
  targetValue: bigint;
  cooldown: bigint;
  lastExecuted: bigint;
  enabled: boolean;
}

export interface AgentConfig {
  owner: Address;
  ensName: string;
  poolKey: {
    currency0: Address;
    currency1: Address;
    fee: number;
    tickSpacing: number;
    hooks: Address;
  };
  status: number;
  depositedAmount: bigint;
  createdAt: bigint;
  lastActivity: bigint;
}

export interface EvaluationResult {
  agentId: bigint;
  ruleIndex: number;
  shouldExecute: boolean;
  reason: string;
  signal?: HookSignal;
}

/**
 * Evaluates agent rules against current market conditions
 */
export class RuleEvaluator {
  private client: PublicClient;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.client = createRobustPublicClient(config);
  }

  /**
   * Evaluate all rules for an agent
   */
  async evaluateAgent(agentId: bigint): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];

    try {
      const [agent, rules] = await Promise.all([
        this.getAgent(agentId),
        this.getRules(agentId),
      ]);

      // Skip inactive agents
      if (agent.status !== 1) {
        logger.debug({ agentId: agentId.toString() }, 'Agent not active, skipping');
        return results;
      }

      // Get latest signal for the pool
      const poolId = this.computePoolId(agent.poolKey);
      const latestSignal = await this.getLatestSignal(poolId);

      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (!rule.enabled) continue;

        const canExecute = await this.canExecuteRule(agentId, BigInt(i));
        if (!canExecute) {
          results.push({
            agentId,
            ruleIndex: i,
            shouldExecute: false,
            reason: 'Cooldown not elapsed',
          });
          continue;
        }

        const evaluation = await this.evaluateRule(
          agentId,
          i,
          rule,
          agent,
          latestSignal
        );
        results.push(evaluation);
      }
    } catch (error) {
      logger.error({ error, agentId: agentId.toString() }, 'Error evaluating agent');
    }

    return results;
  }

  /**
   * Evaluate a single rule
   */
  private async evaluateRule(
    agentId: bigint,
    ruleIndex: number,
    rule: Rule,
    agent: AgentConfig,
    signal: HookSignal | null
  ): Promise<EvaluationResult> {
    const baseResult = {
      agentId,
      ruleIndex,
      signal: signal || undefined,
    };

    switch (rule.ruleType) {
      case RuleType.REBALANCE_THRESHOLD:
        return this.evaluateRebalanceThreshold(baseResult, rule, signal);

      case RuleType.TIME_WEIGHTED:
        return this.evaluateTimeWeighted(baseResult, rule);

      case RuleType.STOP_LOSS:
        return this.evaluateStopLoss(baseResult, rule, signal);

      case RuleType.TAKE_PROFIT:
        return this.evaluateTakeProfit(baseResult, rule, signal);

      case RuleType.CUSTOM_HOOK_SIGNAL:
        return this.evaluateHookSignal(baseResult, rule, signal);

      default:
        return {
          ...baseResult,
          shouldExecute: false,
          reason: 'Unknown rule type',
        };
    }
  }

  private evaluateRebalanceThreshold(
    baseResult: Omit<EvaluationResult, 'shouldExecute' | 'reason'>,
    rule: Rule,
    signal: HookSignal | null
  ): EvaluationResult {
    if (!signal) {
      return { ...baseResult, shouldExecute: false, reason: 'No signal available' };
    }

    // Check if price impact exceeds threshold
    if (signal.signalType === SignalType.PRICE_IMPACT) {
      const shouldExecute = signal.magnitude >= rule.threshold;
      return {
        ...baseResult,
        shouldExecute,
        reason: shouldExecute
          ? `Price impact ${signal.magnitude} >= threshold ${rule.threshold}`
          : `Price impact ${signal.magnitude} < threshold ${rule.threshold}`,
      };
    }

    return { ...baseResult, shouldExecute: false, reason: 'No price impact signal' };
  }

  private evaluateTimeWeighted(
    baseResult: Omit<EvaluationResult, 'shouldExecute' | 'reason'>,
    rule: Rule
  ): EvaluationResult {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const timeSinceLastExecution = now - rule.lastExecuted;
    // For TIME_WEIGHTED rules, cooldown IS the execution interval
    // The rule should execute when cooldown has passed
    const shouldExecute = timeSinceLastExecution >= rule.cooldown;

    return {
      ...baseResult,
      shouldExecute,
      reason: shouldExecute
        ? `Time interval ${timeSinceLastExecution}s >= cooldown ${rule.cooldown}s - READY`
        : `Time interval ${timeSinceLastExecution}s < cooldown ${rule.cooldown}s - waiting ${rule.cooldown - timeSinceLastExecution}s`,
    };
  }

  private evaluateStopLoss(
    baseResult: Omit<EvaluationResult, 'shouldExecute' | 'reason'>,
    rule: Rule,
    signal: HookSignal | null
  ): EvaluationResult {
    if (!signal) {
      return { ...baseResult, shouldExecute: false, reason: 'No signal available' };
    }

    // Trigger stop loss on significant negative price movement
    if (signal.signalType === SignalType.PRICE_IMPACT && signal.magnitude >= rule.threshold) {
      return {
        ...baseResult,
        shouldExecute: true,
        reason: `Stop loss triggered: magnitude ${signal.magnitude} >= threshold ${rule.threshold}`,
      };
    }

    return { ...baseResult, shouldExecute: false, reason: 'Stop loss not triggered' };
  }

  private evaluateTakeProfit(
    baseResult: Omit<EvaluationResult, 'shouldExecute' | 'reason'>,
    rule: Rule,
    signal: HookSignal | null
  ): EvaluationResult {
    // Take profit logic would check if position value exceeds target
    // Simplified: trigger on any significant positive movement
    if (!signal) {
      return { ...baseResult, shouldExecute: false, reason: 'No signal available' };
    }

    return {
      ...baseResult,
      shouldExecute: false,
      reason: 'Take profit evaluation requires price oracle',
    };
  }

  private evaluateHookSignal(
    baseResult: Omit<EvaluationResult, 'shouldExecute' | 'reason'>,
    rule: Rule,
    signal: HookSignal | null
  ): EvaluationResult {
    if (!signal) {
      return { ...baseResult, shouldExecute: false, reason: 'No signal available' };
    }

    // Check if signal type matches and magnitude exceeds threshold
    const targetSignalType = Number(rule.targetValue);
    if (signal.signalType === targetSignalType && signal.magnitude >= rule.threshold) {
      return {
        ...baseResult,
        shouldExecute: true,
        reason: `Hook signal ${signal.signalType} with magnitude ${signal.magnitude} triggered`,
      };
    }

    return {
      ...baseResult,
      shouldExecute: false,
      reason: `Signal type ${signal.signalType} != target ${targetSignalType} or magnitude too low`,
    };
  }

  /**
   * Get agent configuration from contract
   */
  async getAgent(agentId: bigint): Promise<AgentConfig> {
    const result = await this.client.readContract({
      address: this.config.strategyAgentAddress,
      abi: StrategyAgentABI,
      functionName: 'getAgent',
      args: [agentId],
    });

    return result as unknown as AgentConfig;
  }

  /**
   * Get rules for an agent
   */
  async getRules(agentId: bigint): Promise<Rule[]> {
    const result = await this.client.readContract({
      address: this.config.strategyAgentAddress,
      abi: StrategyAgentABI,
      functionName: 'getRules',
      args: [agentId],
    });

    return result as unknown as Rule[];
  }

  /**
   * Check if rule can be executed (cooldown elapsed)
   */
  async canExecuteRule(agentId: bigint, ruleIndex: bigint): Promise<boolean> {
    const result = await this.client.readContract({
      address: this.config.strategyAgentAddress,
      abi: StrategyAgentABI,
      functionName: 'canExecute',
      args: [agentId, ruleIndex],
    });

    return result as boolean;
  }

  /**
   * Get latest signal for a pool
   */
  async getLatestSignal(poolId: `0x${string}`): Promise<HookSignal | null> {
    try {
      const result = await this.client.readContract({
        address: this.config.yellFiHookAddress,
        abi: YellFiHookABI,
        functionName: 'getLatestSignal',
        args: [poolId],
      });

      const signal = result as any;
      if (signal.timestamp === 0n) return null;

      return {
        poolId: signal.poolId,
        signalType: signal.signalType,
        magnitude: signal.magnitude,
        timestamp: signal.timestamp,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get total number of agents
   */
  async getTotalAgents(): Promise<bigint> {
    const result = await this.client.readContract({
      address: this.config.strategyAgentAddress,
      abi: StrategyAgentABI,
      functionName: 'totalAgents',
    });

    return result as bigint;
  }

  /**
   * Compute pool ID from pool key
   */
  private computePoolId(poolKey: AgentConfig['poolKey']): `0x${string}` {
    // Simplified pool ID computation
    // In production, use proper keccak256 of packed pool key
    return `0x${'0'.repeat(64)}` as `0x${string}`;
  }
}

export function createRuleEvaluator(config: Config): RuleEvaluator {
  return new RuleEvaluator(config);
}
