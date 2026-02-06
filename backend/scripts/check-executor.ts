#!/usr/bin/env npx tsx
/**
 * Check YellowExecutorAdapter configuration
 */

import { createPublicClient, http, formatEther, type Address } from 'viem';
import { sepolia } from 'viem/chains';

const STRATEGY_AGENT_ADDRESS = '0x1E1c3ac46e77e695e7d5A04FaaD04C66Bd659947' as Address;
const EXECUTOR_ADAPTER_ADDRESS = '0x6aF9e2d880cbB65f5e37Bd951BdA146e6D893f42' as Address;
const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';

const executorABI = [
  {
    name: 'authorizedCallers',
    type: 'function',
    inputs: [{ name: 'caller', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'yellowRouter',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'owner',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'protocolFeeBps',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

const erc20ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
] as const;

// Token addresses on Sepolia
const WETH = '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' as Address;
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address;

async function main() {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });

  console.log('='.repeat(60));
  console.log('YellowExecutorAdapter Configuration Check');
  console.log('='.repeat(60));
  console.log();

  console.log('Addresses:');
  console.log(`  StrategyAgent: ${STRATEGY_AGENT_ADDRESS}`);
  console.log(`  ExecutorAdapter: ${EXECUTOR_ADAPTER_ADDRESS}`);
  console.log();

  // Check executor owner
  const executorOwner = await client.readContract({
    address: EXECUTOR_ADAPTER_ADDRESS,
    abi: executorABI,
    functionName: 'owner',
  });
  console.log(`Executor owner: ${executorOwner}`);

  // Check if StrategyAgent is authorized
  const isAuthorized = await client.readContract({
    address: EXECUTOR_ADAPTER_ADDRESS,
    abi: executorABI,
    functionName: 'authorizedCallers',
    args: [STRATEGY_AGENT_ADDRESS],
  });
  console.log(`StrategyAgent authorized: ${isAuthorized ? '✅ YES' : '❌ NO'}`);

  // Check yellow router
  const yellowRouter = await client.readContract({
    address: EXECUTOR_ADAPTER_ADDRESS,
    abi: executorABI,
    functionName: 'yellowRouter',
  });
  console.log(`Yellow Router: ${yellowRouter}`);

  // Check protocol fee
  const protocolFee = await client.readContract({
    address: EXECUTOR_ADAPTER_ADDRESS,
    abi: executorABI,
    functionName: 'protocolFeeBps',
  });
  console.log(`Protocol Fee: ${protocolFee} bps (${Number(protocolFee) / 100}%)`);

  console.log();
  console.log('Token balances in ExecutorAdapter (for simulated swaps):');
  
  // Check WETH balance
  const wethBalance = await client.readContract({
    address: WETH,
    abi: erc20ABI,
    functionName: 'balanceOf',
    args: [EXECUTOR_ADAPTER_ADDRESS],
  });
  console.log(`  WETH: ${formatEther(wethBalance)}`);

  // Check USDC balance
  const usdcBalance = await client.readContract({
    address: USDC,
    abi: erc20ABI,
    functionName: 'balanceOf',
    args: [EXECUTOR_ADAPTER_ADDRESS],
  });
  console.log(`  USDC: ${formatEther(usdcBalance)}`);

  console.log();
  console.log('='.repeat(60));

  if (!isAuthorized) {
    console.log();
    console.log('⚠️  StrategyAgent is NOT authorized to call ExecutorAdapter!');
    console.log('   The executor owner needs to call:');
    console.log(`   setAuthorizedCaller(${STRATEGY_AGENT_ADDRESS}, true)`);
  }

  if (wethBalance === 0n && usdcBalance === 0n) {
    console.log();
    console.log('⚠️  ExecutorAdapter has no token balances!');
    console.log('   The simulated swap will fail because there are no output tokens.');
    console.log('   Either:');
    console.log('   1. Send tokens to the ExecutorAdapter for testing');
    console.log('   2. Or implement actual Yellow SDK router integration');
  }
}

main().catch(console.error);
