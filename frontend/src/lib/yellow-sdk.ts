import { 
  createAppSessionMessage, 
  createAuthRequestMessage,
  createAuthVerifyMessage,
  parseAnyRPCResponse,
  RPCProtocolVersion,
  type MessageSigner as NitroliteMessageSigner,
  type RPCData
} from '@erc7824/nitrolite';
import type { Hex, Address } from 'viem';

// Yellow Network ClearNode endpoints
export const CLEARNODE_ENDPOINTS = {
  production: 'wss://clearnet.yellow.com/ws',
  sandbox: 'wss://clearnet-sandbox.yellow.com/ws',
} as const;

export interface YellowSessionConfig {
  application: string;
  allowances: Array<{ asset: string; amount: string }>;
  expiresAt: number;
}

export interface AppSessionDefinition {
  protocol: string;
  participants: string[];
  weights: number[];
  quorum: number;
  challenge: number;
  nonce: number;
}

export interface Allocation {
  participant: string;
  asset: string;
  amount: string;
}

// Message signer type compatible with wagmi's signMessage
export type WalletMessageSigner = (message: string) => Promise<string>;

export type YellowConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface YellowMessage {
  type: string;
  sessionId?: string;
  amount?: string;
  sender?: string;
  data?: unknown;
  error?: string;
}

/**
 * Create a Nitrolite-compatible message signer from a wallet signer
 */
function createNitroliteMessageSigner(walletSigner: WalletMessageSigner): NitroliteMessageSigner {
  return async (payload: RPCData): Promise<Hex> => {
    // Convert RPCData to string for signing
    const message = JSON.stringify(payload);
    const signature = await walletSigner(message);
    return signature as Hex;
  };
}

/**
 * Yellow Network SDK client for frontend integration
 * Enables instant, gasless off-chain transactions via state channels
 */
export class YellowClient {
  private ws: WebSocket | null = null;
  private walletSigner: WalletMessageSigner | null = null;
  private nitroliteMessageSigner: NitroliteMessageSigner | null = null;
  private userAddress: string | null = null;
  private sessionId: string | null = null;
  private status: YellowConnectionStatus = 'disconnected';
  private messageHandlers: Set<(message: YellowMessage) => void> = new Set();
  private statusHandlers: Set<(status: YellowConnectionStatus) => void> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private useSandbox: boolean;

  constructor(useSandbox = true) {
    this.useSandbox = useSandbox;
  }

  /**
   * Initialize the client with wallet signer
   */
  async init(userAddress: string, walletSigner: WalletMessageSigner): Promise<void> {
    this.userAddress = userAddress;
    this.walletSigner = walletSigner;
    this.nitroliteMessageSigner = createNitroliteMessageSigner(walletSigner);
  }

  /**
   * Connect to Yellow Network ClearNode
   */
  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') {
      return;
    }

    this.setStatus('connecting');

    return new Promise((resolve, reject) => {
      const endpoint = this.useSandbox 
        ? CLEARNODE_ENDPOINTS.sandbox 
        : CLEARNODE_ENDPOINTS.production;

      this.ws = new WebSocket(endpoint);

      const connectionTimeout = setTimeout(() => {
        if (this.status !== 'connected') {
          this.setStatus('error');
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.setStatus('connected');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = () => {
        clearTimeout(connectionTimeout);
        this.setStatus('error');
        reject(new Error('WebSocket connection error'));
      };

      this.ws.onclose = () => {
        this.setStatus('disconnected');
        this.attemptReconnect();
      };
    });
  }

  /**
   * Disconnect from ClearNode
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
    this.sessionId = null;
  }

  /**
   * Authenticate with ClearNode
   */
  async authenticate(config: YellowSessionConfig): Promise<void> {
    if (!this.userAddress || !this.nitroliteMessageSigner) {
      throw new Error('Client not initialized');
    }

    if (!this.ws || this.status !== 'connected') {
      throw new Error('Not connected to ClearNode');
    }

    // Create auth request with correct format per SDK types
    const authRequest = await createAuthRequestMessage({
      address: this.userAddress as Address,
      session_key: this.userAddress as Address, // Using wallet as session key for simplicity
      application: config.application,
      allowances: config.allowances.map(a => ({
        asset: a.asset,
        amount: a.amount,
      })),
      expires_at: BigInt(config.expiresAt),
      scope: 'full',
    });

    this.ws.send(authRequest);

    // Wait for challenge and respond
    return new Promise((resolve, reject) => {
      const handler = async (message: YellowMessage) => {
        if (message.type === 'auth_challenge' && message.data) {
          try {
            const verifyMessage = await createAuthVerifyMessage(
              this.nitroliteMessageSigner!,
              message.data as Parameters<typeof createAuthVerifyMessage>[1]
            );
            this.ws!.send(verifyMessage);
          } catch (err) {
            this.messageHandlers.delete(handler);
            reject(err);
          }
        } else if (message.type === 'auth_success') {
          this.messageHandlers.delete(handler);
          resolve();
        } else if (message.type === 'error') {
          this.messageHandlers.delete(handler);
          reject(new Error(message.error || 'Authentication failed'));
        }
      };
      this.messageHandlers.add(handler);
    });
  }

  /**
   * Create a payment session with another participant
   */
  async createPaymentSession(
    partnerAddress: string,
    initialAllocations: { user: string; partner: string; asset: string }
  ): Promise<string> {
    if (!this.userAddress || !this.nitroliteMessageSigner) {
      throw new Error('Client not initialized');
    }

    if (!this.ws || this.status !== 'connected') {
      throw new Error('Not connected to ClearNode');
    }

    // Use correct RPCAppDefinition format with enum
    const appDefinition = {
      application: 'yellfi',
      protocol: RPCProtocolVersion.NitroRPC_0_4,
      participants: [this.userAddress as Hex, partnerAddress as Hex],
      weights: [50, 50],
      quorum: 100,
      challenge: 3600,
      nonce: Date.now(),
    };

    // Use correct RPCAppSessionAllocation format
    const allocations = [
      { 
        participant: this.userAddress as Hex, 
        asset: initialAllocations.asset, 
        amount: initialAllocations.user 
      },
      { 
        participant: partnerAddress as Hex, 
        asset: initialAllocations.asset, 
        amount: initialAllocations.partner 
      },
    ];

    const sessionMessage = await createAppSessionMessage(
      this.nitroliteMessageSigner,
      { definition: appDefinition, allocations }
    );

    this.ws.send(sessionMessage);

    // Session ID will be received via message handler
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageHandlers.delete(handler);
        reject(new Error('Session creation timeout'));
      }, 30000);

      const handler = (message: YellowMessage) => {
        if (message.type === 'session_created' && message.sessionId) {
          clearTimeout(timeout);
          this.sessionId = message.sessionId;
          this.messageHandlers.delete(handler);
          resolve(message.sessionId);
        } else if (message.type === 'error') {
          clearTimeout(timeout);
          this.messageHandlers.delete(handler);
          reject(new Error(message.error || 'Session creation failed'));
        }
      };
      this.messageHandlers.add(handler);
    });
  }

  /**
   * Send an instant payment through the state channel
   */
  async sendPayment(amount: string, recipient: string): Promise<void> {
    if (!this.userAddress || !this.walletSigner) {
      throw new Error('Client not initialized');
    }

    if (!this.ws || this.status !== 'connected') {
      throw new Error('Not connected to ClearNode');
    }

    const paymentData = {
      type: 'payment',
      amount,
      recipient,
      timestamp: Date.now(),
    };

    const signature = await this.walletSigner(JSON.stringify(paymentData));

    const signedPayment = {
      ...paymentData,
      signature,
      sender: this.userAddress,
    };

    this.ws.send(JSON.stringify(signedPayment));
  }

  /**
   * Subscribe to incoming messages
   */
  onMessage(handler: (message: YellowMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Subscribe to connection status changes
   */
  onStatusChange(handler: (status: YellowConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  /**
   * Get current connection status
   */
  getStatus(): YellowConnectionStatus {
    return this.status;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.status === 'connected';
  }

  private setStatus(status: YellowConnectionStatus): void {
    this.status = status;
    this.statusHandlers.forEach(handler => handler(status));
  }

  private handleMessage(data: string): void {
    try {
      // Try using official SDK parser
      const response = parseAnyRPCResponse(data);
      const message: YellowMessage = {
        type: this.extractMessageType(response),
        data: response,
      };
      this.messageHandlers.forEach(handler => handler(message));
    } catch {
      // Fallback to plain JSON parse
      try {
        const message = JSON.parse(data) as YellowMessage;
        this.messageHandlers.forEach(handler => handler(message));
      } catch {
        console.error('Failed to parse message:', data);
      }
    }
  }

  private extractMessageType(response: unknown): string {
    if (typeof response === 'object' && response !== null) {
      const res = response as Record<string, unknown>;
      if ('method' in res) return res.method as string;
      if ('type' in res) return res.type as string;
      if ('result' in res) return 'result';
      if ('error' in res) return 'error';
    }
    return 'unknown';
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }
}

/**
 * Create a Yellow client instance
 */
export function createYellowClient(useSandbox = true): YellowClient {
  return new YellowClient(useSandbox);
}

// Singleton instance for app-wide use
let yellowClientInstance: YellowClient | null = null;

export function getYellowClient(): YellowClient {
  if (!yellowClientInstance) {
    yellowClientInstance = createYellowClient(true);
  }
  return yellowClientInstance;
}
