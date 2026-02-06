#!/usr/bin/env npx tsx
/**
 * Test script that runs the rule evaluation logic without executing
 * This simulates what the backend does during each poll cycle
 */

import { createPublicClient, http, formatEther, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import { StrategyAgentABI } from '../src/abis/index.js';

// Configuration
const STRATEGY_AGENT_ADDRESS = '0x1E1c3ac46e77e695e7d5A04FaaD04C66Bd659947' as Address;
const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';

// Rule types
const RuleType = {
  REBALANCE_THRESHOLD: 0,
  TIME_WEIGHTED: 1,
  LIQUIDITY_RANGE: 2,
  STOP_LOSS: 3,
  TAKE_PROFIT: 4,
  CUSTOM_HOOK_SIGNAL: 5,
} as const;

const RuleTypeNames: Record<number, string> = {
  0: 'REBALANCE_THRESHOLD',
  1: 'TIME_WEIGHTED',
  2: 'LIQUIDITY_RANGE',
  3: 'STOP_LOSS',
  4: 'TAKE_PROFIT',
  5: 'CUSTOM_HOOK_SIGNAL',
};

const AgentStatusNames: Record<number, string> = {
  0: 'INACTIVE',
  1: 'ACTIVE',
  2: 'PAUSED',
  3: 'LIQUIDATED',
};

interface Rule {
  ruleType: number;
  threshold: bigint;
  targetValue: bigint;
  cooldown: bigint;
  lastExecuted: bigint;
  enabled: boolean;
}

interface AgentConfig {
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

interface EvaluationResult {
  agentId: bigint;
  ruleIndex: number;
  shouldExecute: boolean;
  reason: string;
}

function evaluateTimeWeighted(agentId: bigint, ruleIndex: number, rule: Rule): EvaluationResult {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const timeSinceLastExecution = now - rule.lastExecuted;
  const shouldExecute = timeSinceLastExecution >= rule.cooldown;

  return {
    agentId,
    ruleIndex,
    shouldExecute,
    reason: shouldExecute
      ? `Time interval ${timeSinceLastExecution}s >= cooldown ${rule.cooldown}s - READY`
      : `Time interval ${timeSinceLastExecution}s < cooldown ${rule.cooldown}s - waiting ${rule.cooldown - timeSinceLastExecution}s`,
  };
}

function evaluateRule(agentId: bigint, ruleIndex: number, rule: Rule): EvaluationResult {
  switch (rule.ruleType) {
    case RuleType.TIME_WEIGHTED:
      return evaluateTimeWeighted(agentId, ruleIndex, rule);
    case RuleType.REBALANCE_THRESHOLD:
    case RuleType.STOP_LOSS:
    case RuleType.TAKE_PROFIT:
    case RuleType.CUSTOM_HOOK_SIGNAL:
      // These require hook signals which we don't have
      return {
        agentId,
        ruleIndex,
        shouldExecute: false,
        reason: 'Requires hook signal (hook not deployed)',
      };
    default:
      return {
        agentId,
        ruleIndex,
        shouldExecute: false,
        reason: 'Unknown rule type',
      };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('YellFi Backend Evaluation Simulation');
  console.log('='.repeat(70));
  console.log();

  const client = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });

  console.log('Connected to Sepolia');
  console.log(`StrategyAgent: ${STRATEGY_AGENT_ADDRESS}`);
  console.log();

  // Get total agents
  const totalAgents = await client.readContract({
    address: STRATEGY_AGENT_ADDRESS,
    abi: StrategyAgentABI,
    functionName: 'totalAgents',
  }) as bigint;

  console.log(`Total agents: ${totalAgents}`);
  console.log();
  console.log('='.repeat(70));
  console.log('Starting evaluation cycle...');
  console.log('='.repeat(70));
  console.log();

  let readyRulesCount = 0;
  const readyRules: Array<{ agentId: bigint; ruleIndex: number; reason: string }> = [];

  for (let agentId = 1n; agentId <= totalAgents; agentId++) {
    try {
      const agent = await client.readContract({
        address: STRATEGY_AGENT_ADDRESS,
        abi: StrategyAgentABI,
        functionName: 'getAgent',
        args: [agentId],
      }) as AgentConfig;

      console.log(`Agent #${agentId} (${agent.ensName})`);
      console.log(`  Status: ${AgentStatusNames[agent.status]}`);
      console.log(`  Deposited: ${formatEther(agent.depositedAmount)} tokens`);

      // Skip inactive agents
      if (agent.status !== 1) {
        console.log(`  ⏭️  Skipping (not ACTIVE)`);
        console.log();
        continue;
      }

      const rules = await client.readContract({
        address: STRATEGY_AGENT_ADDRESS,
        abi: StrategyAgentABI,
        functionName: 'getRules',
        args: [agentId],
      }) as Rule[];

      console.log(`  Rules: ${rules.length}`);

      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const ruleTypeName = RuleTypeNames[rule.ruleType] || `Unknown(${rule.ruleType})`;

        console.log(`    Rule #${i}: ${ruleTypeName}`);

        if (!rule.enabled) {
          console.log(`      ⏭️  Disabled`);
          continue;
        }

        // Check contract canExecute
        const canExecute = await client.readContract({
          address: STRATEGY_AGENT_ADDRESS,
          abi: StrategyAgentABI,
          functionName: 'canExecute',
          args: [agentId, BigInt(i)],
        }) as boolean;

        console.log(`      Contract canExecute: ${canExecute ? '✅' : '❌'}`);

        if (!canExecute) {
          console.log(`      ⏭️  Cooldown not elapsed`);
          continue;
        }

        // Evaluate rule
        const evaluation = evaluateRule(agentId, i, rule);
        console.log(`      Evaluation: ${evaluation.shouldExecute ? '✅ READY' : '❌ NOT READY'}`);
        console.log(`      Reason: ${evaluation.reason}`);

        if (evaluation.shouldExecute) {
          readyRulesCount++;
          readyRules.push({
            agentId,
            ruleIndex: i,
            reason: evaluation.reason,
          });
          console.log(`      >>> WOULD EXECUTE <<<`);
        }
      }

      console.log();
    } catch (error) {
      console.log(`  Error: ${error instanceof Error ? error.message : error}`);
      console.log();
    }
  }

  console.log('='.repeat(70));
  console.log('Evaluation Summary');
  console.log('='.repeat(70));
  console.log();
  console.log(`Total agents: ${totalAgents}`);
  console.log(`Rules ready to execute: ${readyRulesCount}`);
  console.log();

  if (readyRules.length > 0) {
    console.log('Ready rules:');
    for (const rule of readyRules) {
      console.log(`  - Agent #${rule.agentId}, Rule #${rule.ruleIndex}: ${rule.reason}`);
    }
    console.log();
    console.log('⚠️  To execute these rules, start the backend with a valid KEEPER_PRIVATE_KEY');
  } else {
    console.log('No rules ready to execute at this time.');
  }

  console.log();
  console.log('='.repeat(70));
}

main().catch(console.error);
