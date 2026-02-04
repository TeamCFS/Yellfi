import { Address, encodeAbiParameters, parseAbiParameters, keccak256, toBytes, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import WebSocket from 'ws';
import { 
  createAppSessionMessage, 
  parseAnyRPCResponse,
  RPCProtocolVersion,
  type MessageSigner as NitroliteMessageSigner,
  type RPCData
} from '@erc7824/nitrolite';
import { createChildLogger } from './logger.js';

const logger = createChildLogger('yellow-sdk');

// Yellow Network ClearNode endpoints
export const CLEARNODE_ENDPOINTS = {
  production: 'wss://clearnet.yellow.com/ws',
  sandbox: 'wss://clearnet-sandbox.yellow.com/ws',
} as const;

export interface YellowQuote {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
  route: YellowRoute[];
  routeData: `0x${string}`;
  priceImpact: number;
  gasEstimate: bigint;
}

export interface YellowRoute {
  protocol: string;
  pool: Address;
  tokenIn: Address;
  tokenOut: Address;
  fee: number;
}

export interface YellowSDKConfig {
  clearNodeUrl: string;
  privateKey: `0x${string}`;
  chainId: number;
}

export interface AppSessionDefinition {
  protocol: string;
  participants: Address[];
  weights: number[];
  quorum: number;
  challenge: number;
  nonce: number;
}

export interface Allocation {
  participant: Address;
  asset: string;
  amount: string;
}

export interface AppSession {
  definition: AppSessionDefinition;
  allocations: Allocation[];
  sessionId: string;
  version: number;
  status: 'open' | 'closed';
}

export interface NitroRPCMessage {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown[];
}

export interface NitroRPCResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Yellow Network SDK integration using Nitrolite state channels
 * Connects to ClearNode for off-chain state management
 */
export class YellowSDK {
  private config: YellowSDKConfig;
  private ws: WebSocket | null = null;
  private account: ReturnType<typeof privateKeyToAccount>;
  private messageId = 0;
  private pendingRequests: Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private sessions: Map<string, AppSession> = new Map();
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(config: YellowSDKConfig) {
    this.config = config;
    this.account = privateKeyToAccount(config.privateKey);
  }

  /**
   * Connect to Yellow Network ClearNode
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        logger.info({ url: this.config.clearNodeUrl }, 'Connecting to ClearNode');
        
        this.ws = new WebSocket(this.config.clearNodeUrl);

        const connectionTimeout = setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Connection timeout after 10 seconds'));
          }
        }, 10000);

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          logger.info('Connected to Yellow Network ClearNode');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('error', (error: Error) => {
          clearTimeout(connectionTimeout);
          const errorMessage = error?.message || 'Unknown WebSocket error';
          logger.error({ error: errorMessage }, 'WebSocket error');
          reject(new Error(`WebSocket connection error: ${errorMessage}`));
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          this.isConnected = false;
          logger.warn({ code, reason: reason.toString() }, 'Disconnected from ClearNode');
          this.attemptReconnect();
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        reject(new Error(`Failed to create WebSocket: ${errorMessage}`));
      }
    });
  }

  /**
   * Disconnect from ClearNode
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  /**
   * Create an app session for strategy execution
   */
  async createAppSession(
    participants: Address[],
    allocations: Allocation[]
  ): Promise<AppSession> {
    const definition: AppSessionDefinition = {
      protocol: 'NitroRPC/0.4',
      participants,
      weights: participants.map(() => Math.floor(100 / participants.length)),
      quorum: 100,
      challenge: 3600, // 1 hour dispute window
      nonce: Date.now(),
    };

    const sessionId = this.computeSessionId(definition);

    const message = await this.createSignedMessage('create_app_session', [{
      definition,
      allocations,
    }]);

    await this.sendRequest(message);
    
    const session: AppSession = {
      definition,
      allocations,
      sessionId,
      version: 1,
      status: 'open',
    };

    this.sessions.set(sessionId, session);
    logger.info({ sessionId }, 'App session created');

    return session;
  }

  /**
   * Submit app state update (for strategy execution)
   */
  async submitAppState(
    sessionId: string,
    newAllocations: Allocation[],
    intent: 'OPERATE' | 'DEPOSIT' | 'WITHDRAW' = 'OPERATE'
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const message = await this.createSignedMessage('submit_app_state', [{
      app_session_id: sessionId,
      allocations: newAllocations,
      intent,
      version: session.version + 1,
    }]);

    await this.sendRequest(message);
    
    session.allocations = newAllocations;
    session.version += 1;
    
    logger.info({ sessionId, version: session.version, intent }, 'App state updated');
  }

  /**
   * Close an app session
   */
  async closeAppSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const message = await this.createSignedMessage('close_app_session', [{
      app_session_id: sessionId,
      allocations: session.allocations,
    }]);

    await this.sendRequest(message);
    
    session.status = 'closed';
    logger.info({ sessionId }, 'App session closed');
  }

  /**
   * Get optimal swap quote (simulated for testnet)
   * In production, this would query Yellow Network's liquidity aggregation
   */
  async getQuote(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    slippageBps: number = 50
  ): Promise<YellowQuote> {
    logger.info({ tokenIn, tokenOut, amountIn: amountIn.toString() }, 'Fetching quote');

    // For Sepolia testnet: simulate quote
    // In production: query ClearNode for aggregated liquidity
    const quote = await this.simulateQuote(tokenIn, tokenOut, amountIn, slippageBps);
    
    logger.info(
      { amountOut: quote.amountOut.toString(), priceImpact: quote.priceImpact },
      'Quote received'
    );

    return quote;
  }

  /**
   * Execute swap through Yellow Network state channel
   */
  async executeSwap(
    sessionId: string,
    quote: YellowQuote,
    sender: Address,
    recipient: Address
  ): Promise<{ success: boolean; executionId: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Update allocations to reflect the swap
    const newAllocations: Allocation[] = session.allocations.map(alloc => {
      if (alloc.participant === sender) {
        return {
          ...alloc,
          amount: (BigInt(alloc.amount) - quote.amountIn).toString(),
        };
      }
      if (alloc.participant === recipient) {
        return {
          ...alloc,
          amount: (BigInt(alloc.amount) + quote.amountOut).toString(),
        };
      }
      return alloc;
    });

    await this.submitAppState(sessionId, newAllocations, 'OPERATE');

    const executionId = keccak256(toBytes(JSON.stringify({
      sessionId,
      quote,
      timestamp: Date.now(),
    })));

    logger.info({ executionId, sessionId }, 'Swap executed via state channel');

    return { success: true, executionId };
  }

  /**
   * Build execution data for on-chain fallback
   */
  buildExecutionData(
    agentId: bigint,
    quote: YellowQuote,
    minAmountOut: bigint
  ): `0x${string}` {
    const executionRequest = encodeAbiParameters(
      parseAbiParameters('uint256 agentId, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes routeData'),
      [agentId, quote.tokenIn, quote.tokenOut, quote.amountIn, minAmountOut, quote.routeData]
    );

    return executionRequest;
  }

  /**
   * Validate route is still valid
   */
  async validateRoute(quote: YellowQuote): Promise<boolean> {
    // Re-fetch quote and compare
    try {
      const newQuote = await this.getQuote(
        quote.tokenIn,
        quote.tokenOut,
        quote.amountIn
      );
      
      // Allow 1% deviation
      const deviation = Math.abs(
        Number(newQuote.amountOut - quote.amountOut) / Number(quote.amountOut)
      );
      
      return deviation < 0.01;
    } catch {
      return false;
    }
  }

  /**
   * Get connection status
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Get wallet address
   */
  get address(): Address {
    return this.account.address;
  }

  // Private methods

  private async simulateQuote(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    _slippageBps: number
  ): Promise<YellowQuote> {
    // Simulate 0.3% fee for Sepolia testnet
    const feeAmount = (amountIn * 30n) / 10000n;
    const priceImpact = Number(amountIn) / 1e24;
    const amountOut = amountIn - feeAmount;

    const routeData = encodeAbiParameters(
      parseAbiParameters('address[] path, uint24[] fees'),
      [[tokenIn, tokenOut], [3000]]
    );

    return {
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      route: [
        {
          protocol: 'uniswap-v4',
          pool: '0x0000000000000000000000000000000000000000' as Address,
          tokenIn,
          tokenOut,
          fee: 3000,
        },
      ],
      routeData,
      priceImpact,
      gasEstimate: 150000n,
    };
  }

  private computeSessionId(definition: AppSessionDefinition): string {
    return keccak256(toBytes(JSON.stringify(definition)));
  }

  private async createSignedMessage(
    method: string,
    params: unknown[]
  ): Promise<NitroRPCMessage> {
    const message: NitroRPCMessage = {
      jsonrpc: '2.0',
      id: ++this.messageId,
      method,
      params,
    };

    // Sign the message using viem account
    const messageHash = keccak256(toBytes(JSON.stringify(message)));
    const signature = await this.account.signMessage({ message: messageHash });

    // Add signature to params
    (message.params as unknown[]).push({ signature, signer: this.account.address });

    return message;
  }

  /**
   * Create Nitrolite-compatible message signer
   */
  private createNitroliteMessageSigner(): NitroliteMessageSigner {
    return async (payload: RPCData): Promise<Hex> => {
      const message = JSON.stringify(payload);
      const messageHash = keccak256(toBytes(message));
      return this.account.signMessage({ message: messageHash });
    };
  }

  /**
   * Create app session using official Nitrolite SDK
   */
  private async createAppSessionWithSDK(
    definition: AppSessionDefinition,
    allocations: Allocation[]
  ): Promise<string> {
    const nitroliteDefinition = {
      application: 'yellfi',
      protocol: RPCProtocolVersion.NitroRPC_0_4,
      participants: definition.participants as Hex[],
      weights: definition.weights,
      quorum: definition.quorum,
      challenge: definition.challenge,
      nonce: definition.nonce,
    };

    const nitroliteAllocations = allocations.map(a => ({
      participant: a.participant as Hex,
      asset: a.asset,
      amount: a.amount,
    }));

    const sessionMessage = await createAppSessionMessage(
      this.createNitroliteMessageSigner(),
      { definition: nitroliteDefinition, allocations: nitroliteAllocations }
    );

    return sessionMessage;
  }

  private async sendRequest(message: NitroRPCMessage): Promise<unknown> {
    if (!this.ws || !this.isConnected) {
      throw new Error('Not connected to ClearNode');
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(message.id, { resolve, reject });
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error('Request timeout'));
      }, 30000);

      this.ws!.send(JSON.stringify(message));

      // Update the stored handlers to clear timeout
      const handlers = this.pendingRequests.get(message.id);
      if (handlers) {
        const originalResolve = handlers.resolve;
        const originalReject = handlers.reject;
        
        handlers.resolve = (value) => {
          clearTimeout(timeout);
          originalResolve(value);
        };
        handlers.reject = (error) => {
          clearTimeout(timeout);
          originalReject(error);
        };
      }
    });
  }

  private handleMessage(data: string): void {
    try {
      // Try using official SDK parser first
      let response: NitroRPCResponse;
      try {
        response = parseAnyRPCResponse(data) as unknown as NitroRPCResponse;
      } catch {
        // Fallback to direct JSON parse
        response = JSON.parse(data);
      }
      
      const handlers = this.pendingRequests.get(response.id);
      if (handlers) {
        this.pendingRequests.delete(response.id);
        
        if (response.error) {
          handlers.reject(new Error(response.error.message));
        } else {
          handlers.resolve(response.result);
        }
      } else {
        // Handle notifications/events
        logger.debug({ response }, 'Received notification');
      }
    } catch (error) {
      logger.error({ error, data }, 'Failed to parse message');
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    logger.info({ attempt: this.reconnectAttempts, delay }, 'Attempting reconnection');
    
    setTimeout(() => {
      this.connect().catch((error) => {
        logger.error({ error }, 'Reconnection failed');
      });
    }, delay);
  }
}

/**
 * Create Yellow SDK instance configured for Sepolia
 */
export function createYellowSDK(config: {
  privateKey: `0x${string}`;
  useSandbox?: boolean;
}): YellowSDK {
  return new YellowSDK({
    clearNodeUrl: config.useSandbox 
      ? CLEARNODE_ENDPOINTS.sandbox 
      : CLEARNODE_ENDPOINTS.production,
    privateKey: config.privateKey,
    chainId: 11155111, // Sepolia
  });
}
