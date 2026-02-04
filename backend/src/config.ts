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
    
    // Contracts (Sepolia deployment)
    strategyAgentAddress: optionalEnv('STRATEGY_AGENT_ADDRESS', '0x1E1c3ac46e77e695e7d5A04FaaD04C66Bd659947') as Address,
    yellFiHookAddress: optionalEnv('YELLFI_HOOK_ADDRESS', '0x0000000000000000000000000000000000000000') as Address,
    executorAdapterAddress: optionalEnv('EXECUTOR_ADAPTER_ADDRESS', '0x6aF9e2d880cbB65f5e37Bd951BdA146e6D893f42') as Address,
    
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

// Sepolia contract addresses (update after deployment)
export const SEPOLIA_ADDRESSES = {
  // Uniswap v4 PoolManager on Sepolia
  poolManager: '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543' as Address,
  ensRegistry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as Address,
} as const;
