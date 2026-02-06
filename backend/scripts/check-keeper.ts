#!/usr/bin/env npx tsx
/**
 * Check keeper authorization status
 */

import { createPublicClient, http, type Address } from 'viem';
import { sepolia } from 'viem/chains';

const STRATEGY_AGENT_ADDRESS = '0x1E1c3ac46e77e695e7d5A04FaaD04C66Bd659947' as Address;
const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';

// Minimal ABI for what we need
const ABI = [
  {
    name: 'owner',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'keepers',
    type: 'function',
    inputs: [{ name: 'keeper', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'getAgent',
    type: 'function',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'owner', type: 'address' },
          { name: 'ensName', type: 'string' },
          { name: 'poolKey', type: 'tuple', components: [
            { name: 'currency0', type: 'address' },
            { name: 'currency1', type: 'address' },
            { name: 'fee', type: 'uint24' },
            { name: 'tickSpacing', type: 'int24' },
            { name: 'hooks', type: 'address' },
          ]},
          { name: 'status', type: 'uint8' },
          { name: 'depositedAmount', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'lastActivity', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

async function main() {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });

  console.log('='.repeat(60));
  console.log('Keeper Authorization Check');
  console.log('='.repeat(60));
  console.log();

  // Check contract owner
  const contractOwner = await client.readContract({
    address: STRATEGY_AGENT_ADDRESS,
    abi: ABI,
    functionName: 'owner',
  });
  console.log('Contract owner:', contractOwner);
  console.log();

  // Check keeper status
  const keeperAddr = '0x68b642Cd2EA314860e796F6d0153d70442085859' as Address;
  const isKeeper = await client.readContract({
    address: STRATEGY_AGENT_ADDRESS,
    abi: ABI,
    functionName: 'keepers',
    args: [keeperAddr],
  });
  console.log(`Keeper ${keeperAddr}`);
  console.log(`  Authorized: ${isKeeper ? '✅ YES' : '❌ NO'}`);
  console.log();

  // Check agent owners for agents 4 and 5
  console.log('Agent owners:');
  for (const agentId of [4n, 5n]) {
    const agent = await client.readContract({
      address: STRATEGY_AGENT_ADDRESS,
      abi: ABI,
      functionName: 'getAgent',
      args: [agentId],
    });
    console.log(`  Agent #${agentId}: ${agent.owner}`);
    
    if (agent.owner.toLowerCase() === keeperAddr.toLowerCase()) {
      console.log(`    ✅ Keeper IS the agent owner - can execute`);
    } else {
      console.log(`    ❌ Keeper is NOT the agent owner - needs keeper authorization`);
    }
  }

  console.log();
  console.log('='.repeat(60));
  
  if (!isKeeper) {
    console.log();
    console.log('To fix: The contract owner needs to call:');
    console.log(`  setKeeper(${keeperAddr}, true)`);
    console.log();
    console.log('Run this command with the contract owner private key:');
    console.log('  cd contracts');
    console.log(`  PRIVATE_KEY=0x<owner_key> forge script script/AddKeeper.s.sol:AddKeeperScript --rpc-url ${RPC_URL} --broadcast`);
  }
}

main().catch(console.error);
