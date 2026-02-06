// YellFi Contract Addresses - Sepolia Testnet
export const CONTRACTS = {
  // Chain
  chainId: 11155111,
  chainName: 'Sepolia',
  
  // Deployed contracts (v6 - Uniswap V4 PoolSwapTest integration for real swaps)
  strategyAgent: '0x4Ac56F676e8fA23BAF54E5f387E84E8623e3D5aa' as const,
  yellowExecutorAdapter: '0xD94CB765e030e7d44350f38Bf3438e4Bc519932E' as const,
  ensSubnameMinter: '0x0a01cC2615fEc45845B08bD4A948eFDB45F23d32' as const,
  
  // Official Uniswap v4 contracts on Sepolia (Chain ID: 11155111)
  poolManager: '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543' as const,
  universalRouter: '0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b' as const,
  positionManager: '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4' as const,
  stateView: '0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c' as const,
  quoter: '0x61b3f2011a92d183c7dbadbda940a7555ccf9227' as const,
  poolSwapTest: '0x9b6b46e2c869aa39918db7f52f5557fe577b6eee' as const,
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const,
  
  // ENS (Sepolia)
  ensRegistry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const,
  ensResolver: '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD' as const,
} as const;

// RPC endpoints
export const RPC_URLS = {
  sepolia: 'https://ethereum-sepolia-rpc.publicnode.com',
} as const;

// Block explorer
export const EXPLORER_URLS = {
  sepolia: 'https://sepolia.etherscan.io',
} as const;

// Helper to get explorer URL for address
export function getAddressUrl(address: string): string {
  return `${EXPLORER_URLS.sepolia}/address/${address}`;
}

// Helper to get explorer URL for transaction
export function getTxUrl(txHash: string): string {
  return `${EXPLORER_URLS.sepolia}/tx/${txHash}`;
}
