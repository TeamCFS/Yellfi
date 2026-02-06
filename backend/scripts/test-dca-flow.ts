#!/usr/bin/env npx tsx
/**
 * Test script for TIME_WEIGHTED (DCA) strategy flow
 * 
 * This script:
 * 1. Connects to the StrategyAgent contract
 * 2. Finds or creates a test agent with TIME_WEIGHTED rule
 * 3. Evaluates the rule to check if it should execute
 * 4. Logs detailed information about the evaluation
 */

import { createPublicClient, http, formatEther, parseEther, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { StrategyAgentABI } from '../src/abis/index.js';

// Configuration
const STRATEGY_AGENT_ADDRESS = '0x1E1c3ac46e77e695e7d5A04FaaD04C66Bd659947' as Address;
const RPC_URLS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://sepolia.drpc.org',
  'https://1rpc.io/sepolia',
];

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

async function main() {
  console.log('='.repeat(60));
  console.log('TIME_WEIGHTED (DCA) Strategy Test');
  console.log('='.repeat(60));
  console.log();

  // Create client
  const client = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URLS[0]),
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

  if (totalAgents === 0n) {
    console.log('No agents found. Please create an agent first via the frontend.');
    return;
  }

  // Iterate through all agents
  for (let agentId = 1n; agentId <= totalAgents; agentId++) {
    console.log('-'.repeat(60));
    console.log(`Agent #${agentId}`);
    console.log('-'.repeat(60));

    try {
      // Get agent config
      const agent = await client.readContract({
        address: STRATEGY_AGENT_ADDRESS,
        abi: StrategyAgentABI,
        functionName: 'getAgent',
        args: [agentId],
      }) as AgentConfig;

      console.log(`  Owner: ${agent.owner}`);
      console.log(`  ENS Name: ${agent.ensName}`);
      console.log(`  Status: ${AgentStatusNames[agent.status] || agent.status}`);
      console.log(`  Deposited: ${formatEther(agent.depositedAmount)} tokens`);
      console.log(`  Created: ${new Date(Number(agent.createdAt) * 1000).toISOString()}`);
      console.log(`  Last Activity: ${new Date(Number(agent.lastActivity) * 1000).toISOString()}`);
      console.log();
      console.log(`  Pool Key:`);
      console.log(`    Currency0: ${agent.poolKey.currency0}`);
      console.log(`    Currency1: ${agent.poolKey.currency1}`);
      console.log(`    Fee: ${agent.poolKey.fee}`);
      console.log(`    Tick Spacing: ${agent.poolKey.tickSpacing}`);
      console.log(`    Hooks: ${agent.poolKey.hooks}`);
      console.log();

      // Get rules
      const rules = await client.readContract({
        address: STRATEGY_AGENT_ADDRESS,
        abi: StrategyAgentABI,
        functionName: 'getRules',
        args: [agentId],
      }) as Rule[];

      console.log(`  Rules (${rules.length}):`);
      
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const ruleTypeName = RuleTypeNames[rule.ruleType] || `Unknown(${rule.ruleType})`;
        
        console.log();
        console.log(`    Rule #${i}: ${ruleTypeName}`);
        console.log(`      Enabled: ${rule.enabled}`);
        console.log(`      Threshold: ${rule.threshold}`);
        console.log(`      Target Value: ${rule.targetValue}`);
        console.log(`      Cooldown: ${rule.cooldown}s (${Number(rule.cooldown) / 60} minutes)`);
        console.log(`      Last Executed: ${rule.lastExecuted === 0n ? 'Never' : new Date(Number(rule.lastExecuted) * 1000).toISOString()}`);

        // Check if can execute
        const canExecute = await client.readContract({
          address: STRATEGY_AGENT_ADDRESS,
          abi: StrategyAgentABI,
          functionName: 'canExecute',
          args: [agentId, BigInt(i)],
        }) as boolean;

        console.log(`      Can Execute: ${canExecute ? '✅ YES' : '❌ NO'}`);

        // For TIME_WEIGHTED rules, calculate time until next execution
        if (rule.ruleType === RuleType.TIME_WEIGHTED) {
          const now = BigInt(Math.floor(Date.now() / 1000));
          const timeSinceLastExecution = now - rule.lastExecuted;
          const timeUntilNextExecution = rule.cooldown - timeSinceLastExecution;

          console.log();
          console.log(`      TIME_WEIGHTED Analysis:`);
          console.log(`        Current Time: ${new Date().toISOString()}`);
          console.log(`        Time Since Last: ${timeSinceLastExecution}s (${(Number(timeSinceLastExecution) / 60).toFixed(1)} minutes)`);
          
          if (timeUntilNextExecution > 0n) {
            console.log(`        Time Until Next: ${timeUntilNextExecution}s (${(Number(timeUntilNextExecution) / 60).toFixed(1)} minutes)`);
          } else {
            console.log(`        Time Until Next: READY NOW (overdue by ${-Number(timeUntilNextExecution)}s)`);
          }

          // Evaluate the rule
          const shouldExecute = timeSinceLastExecution >= rule.cooldown;
          console.log(`        Should Execute: ${shouldExecute ? '✅ YES' : '❌ NO'}`);
          
          if (!shouldExecute && canExecute) {
            console.log(`        ⚠️ Mismatch: Contract says canExecute but time check says no`);
          } else if (shouldExecute && !canExecute) {
            console.log(`        ⚠️ Mismatch: Time check says yes but contract says canExecute=false`);
            console.log(`        Possible reasons: Agent not ACTIVE, rule not enabled, or other condition`);
          }
        }
      }
    } catch (error) {
      console.log(`  Error reading agent: ${error instanceof Error ? error.message : error}`);
    }

    console.log();
  }

  console.log('='.repeat(60));
  console.log('Test Complete');
  console.log('='.repeat(60));
}

main().catch(console.error);
