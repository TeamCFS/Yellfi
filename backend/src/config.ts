import { config as dotenvConfig } from 'dotenv';
import { Address } from 'viem';

dotenvConfig();

// Fallback RPC URLs for Sepolia (in order of preference)
// Only using reliable, tested endpoints that return 200
export const SEPOLIA_RPC_URLS = [
  'https://eth-sepolia.g.alchemy.com/v2/kHov0OpJRPUA9Eq3nQuatIysbMRNhloL'
  
] as const;

export interface Config {
  // Network
  rpcUrl: string;
  rpcUrls: string[]; // Fallback RPCs
  chainId: number;
  
  // Contracts
  strategyAgentAddress: Address;
  yellFiHookAddress: Address;
  executorAdapterAddress: Address;
  
  // Keeper
  keeperPrivateKey: `0x${string}`;
  
  // Service
  pollIntervalMs: number;
  maxRetries: number;
  retryDelayMs: number;
  
  // Yellow Network
  yellowClearNodeUrl: string;
  yellowUseSandbox: boolean;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function optionalBoolEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export function loadConfig(): Config {
  // Get primary RPC URL, fallback to first in list
  const primaryRpc = optionalEnv('SEPOLIA_RPC_URL', SEPOLIA_RPC_URLS[0]);
  
  // Build fallback list (primary first, then others)
  const rpcUrls = [primaryRpc, ...SEPOLIA_RPC_URLS.filter(url => url !== primaryRpc)];
  
  return {
    // Network - Sepolia with fallbacks
    rpcUrl: primaryRpc,
    rpcUrls,
    chainId: 11155111,
    
    // Contracts (Sepolia deployment v6 - Uniswap V4 PoolSwapTest integration for real swaps)
    strategyAgentAddress: optionalEnv('STRATEGY_AGENT_ADDRESS', '0x4Ac56F676e8fA23BAF54E5f387E84E8623e3D5aa') as Address,
    yellFiHookAddress: optionalEnv('YELLFI_HOOK_ADDRESS', '0x0000000000000000000000000000000000000000') as Address,
    executorAdapterAddress: optionalEnv('EXECUTOR_ADAPTER_ADDRESS', '0xD94CB765e030e7d44350f38Bf3438e4Bc519932E') as Address,
    
    // Keeper
    keeperPrivateKey: requireEnv('KEEPER_PRIVATE_KEY') as `0x${string}`,
    
    // Service - increased retries for RPC reliability
    pollIntervalMs: parseInt(optionalEnv('POLL_INTERVAL_MS', '15000')),
    maxRetries: parseInt(optionalEnv('MAX_RETRIES', '5')),
    retryDelayMs: parseInt(optionalEnv('RETRY_DELAY_MS', '3000')),
    
    // Yellow Network - State Channels
    yellowClearNodeUrl: optionalEnv('YELLOW_CLEARNODE_URL', 'wss://clearnet-sandbox.yellow.com/ws'),
    yellowUseSandbox: optionalBoolEnv('YELLOW_USE_SANDBOX', true), // Use sandbox for Sepolia
  };
}

// Sepolia contract addresses - Official Uniswap V4 deployment
export const SEPOLIA_ADDRESSES = {
  // Uniswap v4 contracts on Sepolia (Chain ID: 11155111)
  poolManager: '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543' as Address,
  universalRouter: '0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b' as Address,
  positionManager: '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4' as Address,
  stateView: '0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c' as Address,
  quoter: '0x61b3f2011a92d183c7dbadbda940a7555ccf9227' as Address,
  poolSwapTest: '0x9b6b46e2c869aa39918db7f52f5557fe577b6eee' as Address,
  poolModifyLiquidityTest: '0x0c478023803a644c94c4ce1c1e7b9a087e411b0a' as Address,
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
  // ENS
  ensRegistry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as Address,
} as const;
