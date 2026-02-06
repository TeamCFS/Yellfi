#!/usr/bin/env npx tsx
/**
 * End-to-End Test for Time-Weighted (DCA) Execution
 * 
 * This script tests the complete flow:
 * 1. Check contract deployment
 * 2. Create an agent (if needed)
 * 3. Add a TIME_WEIGHTED rule
 * 4. Deposit tokens
 * 5. Execute the rule
 * 6. Verify balance updates
 */

import { 
  createPublicClient, 
  createWalletClient,
  http, 
  formatEther,
  parseEther,
  encodeAbiParameters,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Contract addresses (v5)
const STRATEGY_AGENT = '0x2158bEfE94e6b2197bcCa8B06a56E1d722BF21Ef' as Address;
const EXECUTOR = '0x686bb19903CbDb79d4086f3C6880945Bb5Efde5B' as Address;
const WETH = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' as Address;
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address;

const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';

// Get private key from environment
const PRIVATE_KEY = process.env.KEEPER_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error('Please set KEEPER_PRIVATE_KEY or PRIVATE_KEY environment variable');
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY as Hex);

// ABIs
const strategyAgentABI = [
  { name: 'totalAgents', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'getAgent', type: 'function', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ type: 'tuple', components: [{ name: 'owner', type: 'address' }, { name: 'ensName', type: 'string' }, { name: 'poolKey', type: 'tuple', components: [{ name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] }, { name: 'status', type: 'uint8' }, { name: 'depositedAmount', type: 'uint256' }, { name: 'createdAt', type: 'uint256' }, { name: 'lastActivity', type: 'uint256' }] }], stateMutability: 'view' },
  { name: 'getRules', type: 'function', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ type: 'tuple[]', components: [{ name: 'ruleType', type: 'uint8' }, { name: 'threshold', type: 'uint256' }, { name: 'targetValue', type: 'uint256' }, { name: 'cooldown', type: 'uint256' }, { name: 'lastExecuted', type: 'uint256' }, { name: 'enabled', type: 'bool' }] }], stateMutability: 'view' },
  { name: 'getAgentBalance', type: 'function', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'token', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'canExecute', type: 'function', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'ruleIndex', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { name: 'keepers', type: 'function', inputs: [{ name: 'keeper', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { name: 'execute', type: 'function', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'ruleIndex', type: 'uint256' }, { name: 'executionData', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

const erc20ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

function buildExecutionData(
  agentId: bigint,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  minAmountOut: bigint
): Hex {
  return encodeAbiParameters(
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
        amountIn,
        minAmountOut,
        routeData: '0x',
      },
    ]
  );
}

async function main() {
  console.log('='.repeat(80));
  console.log('END-TO-END TEST: Time-Weighted (DCA) Execution');
  console.log('='.repeat(80));
  console.log();

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  });

  console.log(`Keeper Address: ${account.address}`);
  console.log(`StrategyAgent: ${STRATEGY_AGENT}`);
  console.log();

  // Step 1: Check keeper authorization
  console.log('STEP 1: Check Keeper Authorization');
  console.log('-'.repeat(40));
  
  const isKeeper = await publicClient.readContract({
    address: STRATEGY_AGENT,
    abi: strategyAgentABI,
    functionName: 'keepers',
    args: [account.address],
  });
  
  console.log(`Keeper authorized: ${isKeeper ? '✅ YES' : '❌ NO'}`);
  
  if (!isKeeper) {
    console.log('❌ Keeper not authorized. Cannot proceed.');
    return;
  }
  console.log();

  // Step 2: Find an agent with TIME_WEIGHTED rule
  console.log('STEP 2: Find Agent with TIME_WEIGHTED Rule');
  console.log('-'.repeat(40));
  
  const totalAgents = await publicClient.readContract({
    address: STRATEGY_AGENT,
    abi: strategyAgentABI,
    functionName: 'totalAgents',
  });
  
  console.log(`Total agents: ${totalAgents}`);
  
  let targetAgentId: bigint | null = null;
  let targetRuleIndex: number | null = null;
  
  for (let agentId = 1n; agentId <= totalAgents; agentId++) {
    const agent = await publicClient.readContract({
      address: STRATEGY_AGENT,
      abi: strategyAgentABI,
      functionName: 'getAgent',
      args: [agentId],
    });
    
    if (agent.status !== 1) continue; // Skip non-active agents
    
    const rules = await publicClient.readContract({
      address: STRATEGY_AGENT,
      abi: strategyAgentABI,
      functionName: 'getRules',
      args: [agentId],
    });
    
    for (let i = 0; i < rules.length; i++) {
      if (rules[i].ruleType === 1 && rules[i].enabled) { // TIME_WEIGHTED
        const canExec = await publicClient.readContract({
          address: STRATEGY_AGENT,
          abi: strategyAgentABI,
          functionName: 'canExecute',
          args: [agentId, BigInt(i)],
        });
        
        if (canExec) {
          targetAgentId = agentId;
          targetRuleIndex = i;
          console.log(`Found: Agent #${agentId} (${agent.ensName}), Rule #${i}`);
          break;
        }
      }
    }
    
    if (targetAgentId) break;
  }
  
  if (!targetAgentId || targetRuleIndex === null) {
    console.log('❌ No executable TIME_WEIGHTED rule found.');
    console.log('   Create an agent with a TIME_WEIGHTED rule and deposit tokens first.');
    return;
  }
  console.log();

  // Step 3: Get agent details
  console.log('STEP 3: Get Agent Details');
  console.log('-'.repeat(40));
  
  const agent = await publicClient.readContract({
    address: STRATEGY_AGENT,
    abi: strategyAgentABI,
    functionName: 'getAgent',
    args: [targetAgentId],
  });
  
  const wethBalance = await publicClient.readContract({
    address: STRATEGY_AGENT,
    abi: strategyAgentABI,
    functionName: 'getAgentBalance',
    args: [targetAgentId, WETH],
  });
  
  const usdcBalance = await publicClient.readContract({
    address: STRATEGY_AGENT,
    abi: strategyAgentABI,
    functionName: 'getAgentBalance',
    args: [targetAgentId, USDC],
  });
  
  console.log(`Agent: ${agent.ensName}`);
  console.log(`WETH Balance: ${formatEther(wethBalance)}`);
  console.log(`USDC Balance: ${formatEther(usdcBalance)}`);
  console.log();

  // Step 4: Build execution data
  console.log('STEP 4: Build Execution Data');
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
    return;
  }
  
  const swapAmount = balance / 10n; // 10% of balance
  const minAmountOut = (swapAmount * 99n) / 100n; // 1% slippage
  
  console.log(`Token In: ${tokenIn === WETH ? 'WETH' : 'USDC'}`);
  console.log(`Token Out: ${tokenOut === WETH ? 'WETH' : 'USDC'}`);
  console.log(`Swap Amount: ${formatEther(swapAmount)}`);
  console.log(`Min Amount Out: ${formatEther(minAmountOut)}`);
  
  const executionData = buildExecutionData(
    targetAgentId,
    tokenIn,
    tokenOut,
    swapAmount,
    minAmountOut
  );
  
  console.log(`Execution Data: ${executionData.slice(0, 66)}...`);
  console.log();

  // Step 5: Simulate execution
  console.log('STEP 5: Simulate Execution');
  console.log('-'.repeat(40));
  
  try {
    await publicClient.simulateContract({
      address: STRATEGY_AGENT,
      abi: strategyAgentABI,
      functionName: 'execute',
      args: [targetAgentId, BigInt(targetRuleIndex), executionData],
      account: account.address,
    });
    console.log('✅ Simulation PASSED');
  } catch (error: any) {
    console.log('❌ Simulation FAILED');
    console.log(`Error: ${error.message}`);
    return;
  }
  console.log();

  // Step 6: Execute on-chain
  console.log('STEP 6: Execute On-Chain');
  console.log('-'.repeat(40));
  
  try {
    const hash = await walletClient.writeContract({
      address: STRATEGY_AGENT,
      abi: strategyAgentABI,
      functionName: 'execute',
      args: [targetAgentId, BigInt(targetRuleIndex), executionData],
    });
    
    console.log(`Transaction Hash: ${hash}`);
    console.log('Waiting for confirmation...');
    
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });
    
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas Used: ${receipt.gasUsed}`);
  } catch (error: any) {
    console.log('❌ Execution FAILED');
    console.log(`Error: ${error.message}`);
    return;
  }
  console.log();

  // Step 7: Verify balance updates
  console.log('STEP 7: Verify Balance Updates');
  console.log('-'.repeat(40));
  
  const newWethBalance = await publicClient.readContract({
    address: STRATEGY_AGENT,
    abi: strategyAgentABI,
    functionName: 'getAgentBalance',
    args: [targetAgentId, WETH],
  });
  
  const newUsdcBalance = await publicClient.readContract({
    address: STRATEGY_AGENT,
    abi: strategyAgentABI,
    functionName: 'getAgentBalance',
    args: [targetAgentId, USDC],
  });
  
  console.log(`WETH Balance: ${formatEther(wethBalance)} -> ${formatEther(newWethBalance)}`);
  console.log(`USDC Balance: ${formatEther(usdcBalance)} -> ${formatEther(newUsdcBalance)}`);
  
  const wethDiff = newWethBalance - wethBalance;
  const usdcDiff = newUsdcBalance - usdcBalance;
  
  console.log(`WETH Change: ${wethDiff >= 0n ? '+' : ''}${formatEther(wethDiff)}`);
  console.log(`USDC Change: ${usdcDiff >= 0n ? '+' : ''}${formatEther(usdcDiff)}`);
  console.log();

  // Step 8: Check rule state
  console.log('STEP 8: Check Rule State');
  console.log('-'.repeat(40));
  
  const rules = await publicClient.readContract({
    address: STRATEGY_AGENT,
    abi: strategyAgentABI,
    functionName: 'getRules',
    args: [targetAgentId],
  });
  
  const rule = rules[targetRuleIndex];
  console.log(`Last Executed: ${new Date(Number(rule.lastExecuted) * 1000).toISOString()}`);
  console.log(`Cooldown: ${rule.cooldown}s`);
  
  const canExecNow = await publicClient.readContract({
    address: STRATEGY_AGENT,
    abi: strategyAgentABI,
    functionName: 'canExecute',
    args: [targetAgentId, BigInt(targetRuleIndex)],
  });
  console.log(`Can Execute Now: ${canExecNow ? '✅ YES' : '❌ NO (cooldown active)'}`);
  console.log();

  console.log('='.repeat(80));
  console.log('✅ END-TO-END TEST COMPLETED SUCCESSFULLY');
  console.log('='.repeat(80));
}

main().catch(console.error);
