// Yellow Network Configuration

export const YELLOW_CONFIG = {
  // ClearNode WebSocket endpoints
  endpoints: {
    production: 'wss://clearnet.yellow.com/ws',
    sandbox: 'wss://clearnet-sandbox.yellow.com/ws',
  },
  
  // Use sandbox for Sepolia testnet
  useSandbox: true,
  
  // Default session configuration
  defaultSession: {
    // 1 hour dispute window
    challengePeriod: 3600,
    // Equal weights for 2-party sessions
    weights: [50, 50],
    // Both parties must agree
    quorum: 100,
  },
  
  // Supported assets on Sepolia
  supportedAssets: [
    { symbol: 'ETH', decimals: 18 },
    { symbol: 'USDC', decimals: 6 },
    { symbol: 'WETH', decimals: 18 },
  ],
} as const;

// Get the appropriate ClearNode endpoint
export function getClearNodeEndpoint(): string {
  return YELLOW_CONFIG.useSandbox 
    ? YELLOW_CONFIG.endpoints.sandbox 
    : YELLOW_CONFIG.endpoints.production;
}

// Format amount for Yellow Network (string representation)
export function formatYellowAmount(amount: bigint, _decimals?: number): string {
  return amount.toString();
}

// Parse amount from Yellow Network
export function parseYellowAmount(amount: string): bigint {
  return BigInt(amount);
}
