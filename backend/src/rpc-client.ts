import { createPublicClient, http, fallback, type PublicClient } from 'viem';
import { sepolia } from 'viem/chains';
import { createChildLogger } from './logger.js';
import type { Config } from './config.js';

const logger = createChildLogger('rpc-client');

/**
 * Creates a public client with fallback RPC support and retry logic
 */
export function createRobustPublicClient(config: Config): PublicClient {
  // Create transports for each RPC URL with retry logic
  const transports = config.rpcUrls.map((url, index) => {
    return http(url, {
      retryCount: 3,
      retryDelay: 1000,
      timeout: 30000,
      onFetchRequest: (request) => {
        logger.debug({ url, method: request.method }, 'RPC request');
      },
      onFetchResponse: (response) => {
        if (!response.ok) {
          logger.warn({ url, status: response.status }, 'RPC response error, will try fallback');
        }
      },
    });
  });

  logger.info({ rpcCount: config.rpcUrls.length }, 'Initializing RPC client with fallback support');

  return createPublicClient({
    chain: sepolia,
    transport: fallback(transports, {
      rank: true, // Automatically rank RPCs by latency
      retryCount: 3,
      retryDelay: 1000,
    }),
  });
}

/**
 * Utility to execute RPC calls with retry and fallback
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 3, retryDelay = 1000, onRetry } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        onRetry?.(attempt, lastError);
        logger.warn({ attempt, maxRetries, error: lastError.message }, 'RPC call failed, retrying...');
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }
  
  throw lastError;
}

/**
 * Health check for RPC endpoints
 */
export async function checkRpcHealth(rpcUrls: string[]): Promise<{ url: string; healthy: boolean; latency?: number }[]> {
  const results = await Promise.all(
    rpcUrls.map(async (url) => {
      const start = Date.now();
      try {
        const client = createPublicClient({
          chain: sepolia,
          transport: http(url, { timeout: 5000 }),
        });
        await client.getBlockNumber();
        return { url, healthy: true, latency: Date.now() - start };
      } catch {
        return { url, healthy: false };
      }
    })
  );
  
  return results;
}
