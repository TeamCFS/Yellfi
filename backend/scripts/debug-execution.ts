#!/usr/bin/env npx tsx
/**
 * Debug script for Time-Weighted execution revert
 * Traces through each step to identify the exact failure point
 */

import { 
  createPublicClient, 
  http, 
  formatEther, 
  decodeAbiParameters,
  encodeAbiParameters,
  parseAbiParameters,
  type Address 
} from 'viem';
import { sepolia } from 'viem/chains';

// Contract addresses (v5)
const STRATEGY_AGENT = '0x2158bEfE94e6b2197bcCa8B06a56E1d722BF21Ef' as Address;
const EXECUTOR = '0x686bb19903CbDb79d4086f3C6880945Bb5Efde5B' as Address;
const ENS_MINTER = '0x0a01cC2615fEc45845B08bD4A948eFDB45F23d32' as Address;
const WETH = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' as Address;
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address;
const KEEPER = '0x68b642Cd2EA314860e796F6d0153d70442085859' as Address;

const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';

// ABIs
const strategyAgentABI = [
  { name: 'getAgent', type: 'function', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ type: 'tuple', components: [{ name: 'owner', type: 'address' }, { name: 'ensName', type: 'string' }, { name: 'poolKey', type: 'tuple', components: [{ name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] }, { name: 'status', type: 'uint8' }, { name: 'depositedAmount', type: 'uint256' }, { name: 'createdAt', type: 'uint256' }, { name: 'lastActivity', type: 'uint256' }] }], stateMutability: 'view' },
  { name: 'getRules', type: 'function', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ type: 'tuple[]', components: [{ name: 'ruleType', type: 'uint8' }, { name: 'threshold', type: 'uint256' }, { name: 'targetValue', type: 'uint256' }, { name: 'cooldown', type: 'uint256' }, { name: 'lastExecuted', type: 'uint256' }, { name: 'enabled', type: 'bool' }] }], stateMutability: 'view' },
  { name: 'getAgentBalance', type: 'function', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'token', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'canExecute', type: 'function', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'ruleIndex', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { name: 'keepers', type: 'function', inputs: [{ name: 'keeper', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { name: 'executor', type: 'function', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { name: 'totalAgents', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'execute', type: 'function', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'ruleIndex', type: 'uint256' }, { name: 'executionData', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

const executorABI = [
  { name: 'testMode', type: 'function', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { name: 'authorizedCallers', type: 'function', inputs: [{ name: 'caller', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { name: 'protocolFeeBps', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'owner', type: 'function', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
] as const;

const erc20ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

const AgentStatusNames: Record<number, string> = {
  0: 'INACTIVE',
  1: 'ACTIVE',
  2: 'PAUSED',
  3: 'LIQUIDATED',
};

const RuleTypeNames: Record<number, string> = {
  0: 'REBALANCE_THRESHOLD',
  1: 'TIME_WEIGHTED',
  2: 'LIQUIDITY_RANGE',
  3: 'STOP_LOSS',
  4: 'TAKE_PROFIT',
  5: 'CUSTOM_HOOK_SIGNAL',
};

async function main() {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });

  console.log('='.repeat(80));
  console.log('TIME-WEIGHTED EXECUTION DEBUG');
  console.log('='.repeat(80));
  console.log();

  // 1. Check contract deployment
  console.log('1. CONTRACT DEPLOYMENT CHECK');
  console.log('-'.repeat(40));
  
  const agentCode = await client.getCode({ address: STRATEGY_AGENT });
  const executorCode = await client.getCode({ address: EXECUTOR });
  
  console.log(`StrategyAgent (${STRATEGY_AGENT}): ${agentCode && agentCode !== '0x' ? '✅ Deployed' : '❌ Not deployed'}`);
  console.log(`Executor (${EXECUTOR}): ${executorCode && executorCode !== '0x' ? '✅ Deployed' : '❌ Not deployed'}`);
  console.log();

  // 2. Check executor configuration
  console.log('2. EXECUTOR CONFIGURATION');
  console.log('-'.repeat(40));
  
  const testMode = await client.readContract({ address: EXECUTOR, abi: executorABI, functionName: 'testMode' });
  const executorOwner = await client.readContract({ address: EXECUTOR, abi: executorABI, functionName: 'owner' });
  const isAgentAuthorized = await client.readContract({ address: EXECUTOR, abi: executorABI, functionName: 'authorizedCallers', args: [STRATEGY_AGENT] });
  const protocolFee = await client.readContract({ address: EXECUTOR, abi: executorABI, functionName: 'protocolFeeBps' });
  
  console.log(`Test Mode: ${testMode ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`Executor Owner: ${executorOwner}`);
  console.log(`StrategyAgent Authorized: ${isAgentAuthorized ? '✅ Yes' : '❌ No'}`);
  console.log(`Protocol Fee: ${protocolFee} bps`);
  console.log();

  // 3. Check keeper authorization
  console.log('3. KEEPER AUTHORIZATION');
  console.log('-'.repeat(40));
  
  const isKeeper = await client.readContract({ address: STRATEGY_AGENT, abi: strategyAgentABI, functionName: 'keepers', args: [KEEPER] });
  console.log(`Keeper (${KEEPER}): ${isKeeper ? '✅ Authorized' : '❌ Not authorized'}`);
  console.log();

  // 4. Check total agents
  const totalAgents = await client.readContract({ address: STRATEGY_AGENT, abi: strategyAgentABI, functionName: 'totalAgents' });
  console.log('4. AGENTS');
  console.log('-'.repeat(40));
  console.log(`Total Agents: ${totalAgents}`);
  console.log();

  if (totalAgents === 0n) {
    console.log('❌ No agents found. Create an agent first.');
    return;
  }

  // 5. Check each agent
  for (let agentId = 1n; agentId <= totalAgents; agentId++) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`AGENT #${agentId} DETAILED ANALYSIS`);
    console.log('='.repeat(80));

    try {
      const agent = await client.readContract({ address: STRATEGY_AGENT, abi: strategyAgentABI, functionName: 'getAgent', args: [agentId] });
      const rules = await client.readContract({ address: STRATEGY_AGENT, abi: strategyAgentABI, functionName: 'getRules', args: [agentId] });

      console.log('\n5.1 AGENT INFO');
      console.log('-'.repeat(40));
      console.log(`ENS Name: ${agent.ensName}`);
      console.log(`Owner: ${agent.owner}`);
      console.log(`Status: ${AgentStatusNames[agent.status]} (${agent.status})`);
      console.log(`Deposited Amount: ${formatEther(agent.depositedAmount)}`);
      console.log(`Created: ${new Date(Number(agent.createdAt) * 1000).toISOString()}`);
      console.log(`Last Activity: ${new Date(Number(agent.lastActivity) * 1000).toISOString()}`);

      console.log('\n5.2 POOL KEY');
      console.log('-'.repeat(40));
      console.log(`Currency0: ${agent.poolKey.currency0}`);
      console.log(`Currency1: ${agent.poolKey.currency1}`);
      console.log(`Fee: ${agent.poolKey.fee}`);
      console.log(`Tick Spacing: ${agent.poolKey.tickSpacing}`);
      console.log(`Hooks: ${agent.poolKey.hooks}`);
      
      // Check token ordering
      const isCorrectOrder = agent.poolKey.currency0.toLowerCase() < agent.poolKey.currency1.toLowerCase();
      console.log(`Token Ordering: ${isCorrectOrder ? '✅ Correct' : '⚠️ May need swap'}`);

      console.log('\n5.3 TOKEN BALANCES');
      console.log('-'.repeat(40));
      
      const wethBalance = await client.readContract({ address: STRATEGY_AGENT, abi: strategyAgentABI, functionName: 'getAgentBalance', args: [agentId, WETH] });
      const usdcBalance = await client.readContract({ address: STRATEGY_AGENT, abi: strategyAgentABI, functionName: 'getAgentBalance', args: [agentId, USDC] });
      const actualWethBalance = await client.readContract({ address: WETH, abi: erc20ABI, functionName: 'balanceOf', args: [STRATEGY_AGENT] });
      
      console.log(`WETH (internal): ${formatEther(wethBalance)}`);
      console.log(`USDC (internal): ${formatEther(usdcBalance)}`);
      console.log(`WETH (actual contract): ${formatEther(actualWethBalance)}`);

      console.log('\n5.4 RULES');
      console.log('-'.repeat(40));
      
      if (rules.length === 0) {
        console.log('❌ No rules configured');
        continue;
      }

      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const canExec = await client.readContract({ address: STRATEGY_AGENT, abi: strategyAgentABI, functionName: 'canExecute', args: [agentId, BigInt(i)] });
        
        console.log(`\nRule #${i}: ${RuleTypeNames[rule.ruleType]}`);
        console.log(`  Enabled: ${rule.enabled ? '✅' : '❌'}`);
        console.log(`  Threshold: ${rule.threshold}`);
        console.log(`  Target Value: ${rule.targetValue}`);
        console.log(`  Cooldown: ${rule.cooldown}s`);
        console.log(`  Last Executed: ${rule.lastExecuted === 0n ? 'Never' : new Date(Number(rule.lastExecuted) * 1000).toISOString()}`);
        console.log(`  Can Execute: ${canExec ? '✅ YES' : '❌ NO'}`);

        // For TIME_WEIGHTED rules, check timing
        if (rule.ruleType === 1) {
          const now = BigInt(Math.floor(Date.now() / 1000));
          const timeSinceLast = now - rule.lastExecuted;
          const timeUntilNext = rule.cooldown - timeSinceLast;
          
          console.log(`  Time Since Last: ${timeSinceLast}s`);
          if (timeUntilNext > 0n) {
            console.log(`  Time Until Next: ${timeUntilNext}s`);
          } else {
            console.log(`  Time Until Next: READY NOW`);
          }
        }

        // If can execute, try to simulate
        if (canExec && rule.enabled && agent.status === 1) {
          console.log('\n5.5 EXECUTION SIMULATION');
          console.log('-'.repeat(40));

          // Determine swap direction based on balances
          let tokenIn = WETH;
          let tokenOut = USDC;
          let balance = wethBalance;
          
          if (usdcBalance > wethBalance) {
            tokenIn = USDC;
            tokenOut = WETH;
            balance = usdcBalance;
          }

          if (balance === 0n) {
            console.log('❌ No balance to swap');
            continue;
          }

          const swapAmount = balance / 10n; // 10% of balance
          const minAmountOut = (swapAmount * 99n) / 100n; // 1% slippage

          console.log(`Token In: ${tokenIn}`);
          console.log(`Token Out: ${tokenOut}`);
          console.log(`Swap Amount: ${formatEther(swapAmount)}`);
          console.log(`Min Amount Out: ${formatEther(minAmountOut)}`);

          // Build execution data as a tuple (struct) for Solidity abi.decode
          const executionData = encodeAbiParameters(
            [
              {
                type: 'tuple',
                components: [
                  { name: 'agentId', type: 'uint256' },
                  { name: 'tokenIn', type: 'address' },
                  { name: 'tokenOut', type: 'address' },
                  { name: 'amountIn', type: 'uint256' },
                  { name: 'minAmountOut', type: 'uint256' },
                  { name: 'routeData', type: 'bytes' },
                ],
              },
            ],
            [
              {
                agentId,
                tokenIn,
                tokenOut,
                amountIn: swapAmount,
                minAmountOut,
                routeData: '0x' as `0x${string}`,
              },
            ]
          );

          console.log(`\nExecution Data: ${executionData.slice(0, 66)}...`);

          // Try to simulate
          try {
            await client.simulateContract({
              address: STRATEGY_AGENT,
              abi: strategyAgentABI,
              functionName: 'execute',
              args: [agentId, BigInt(i), executionData],
              account: KEEPER,
            });
            console.log('✅ Simulation PASSED');
          } catch (error: any) {
            console.log('❌ Simulation FAILED');
            console.log(`Error: ${error.message}`);
            
            // Try to extract more details
            if (error.cause) {
              console.log(`Cause: ${error.cause.message || error.cause}`);
            }
            if (error.details) {
              console.log(`Details: ${error.details}`);
            }

            // Check specific conditions
            console.log('\n5.6 FAILURE DIAGNOSIS');
            console.log('-'.repeat(40));

            // Check allowance
            const allowance = await client.readContract({ 
              address: tokenIn, 
              abi: erc20ABI, 
              functionName: 'allowance', 
              args: [STRATEGY_AGENT, EXECUTOR] 
            });
            console.log(`Current Allowance to Executor: ${formatEther(allowance)}`);

            // Check if agent is active
            console.log(`Agent Status: ${agent.status === 1 ? '✅ ACTIVE' : '❌ NOT ACTIVE'}`);

            // Check if rule is enabled
            console.log(`Rule Enabled: ${rule.enabled ? '✅ Yes' : '❌ No'}`);

            // Check balance vs swap amount
            console.log(`Balance >= Swap Amount: ${balance >= swapAmount ? '✅ Yes' : '❌ No'}`);
          }
        }
      }
    } catch (error: any) {
      console.log(`Error reading agent ${agentId}: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('DEBUG COMPLETE');
  console.log('='.repeat(80));
}

main().catch(console.error);
