import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { 
  getYellowClient, 
  type YellowConnectionStatus, 
  type YellowMessage,
  type WalletMessageSigner 
} from '@/lib/yellow-sdk';

export interface UseYellowNetworkReturn {
  // Connection state
  status: YellowConnectionStatus;
  isConnected: boolean;
  sessionId: string | null;
  
  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  createSession: (partnerAddress: string, allocations: {
    user: string;
    partner: string;
    asset: string;
  }) => Promise<string>;
  sendPayment: (amount: string, recipient: string) => Promise<void>;
  
  // Messages
  messages: YellowMessage[];
  lastMessage: YellowMessage | null;
  
  // Error handling
  error: string | null;
}

/**
 * React hook for Yellow Network state channel integration
 * Provides instant, gasless off-chain transactions
 */
export function useYellowNetwork(): UseYellowNetworkReturn {
  const { address, isConnected: walletConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  
  const [status, setStatus] = useState<YellowConnectionStatus>('disconnected');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<YellowMessage[]>([]);
  const [lastMessage, setLastMessage] = useState<YellowMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const clientRef = useRef(getYellowClient());
  const initializedRef = useRef(false);

  // Create message signer using wagmi
  const messageSigner: WalletMessageSigner = useCallback(async (message: string) => {
    return signMessageAsync({ message });
  }, [signMessageAsync]);

  // Initialize client when wallet connects
  useEffect(() => {
    if (walletConnected && address && !initializedRef.current) {
      clientRef.current.init(address, messageSigner);
      initializedRef.current = true;
    }
  }, [walletConnected, address, messageSigner]);

  // Subscribe to status changes
  useEffect(() => {
    const unsubscribe = clientRef.current.onStatusChange((newStatus) => {
      setStatus(newStatus);
      if (newStatus === 'error') {
        setError('Connection error');
      } else {
        setError(null);
      }
    });

    return unsubscribe;
  }, []);

  // Subscribe to messages
  useEffect(() => {
    const unsubscribe = clientRef.current.onMessage((message) => {
      setMessages(prev => [...prev, message]);
      setLastMessage(message);

      // Handle session creation
      if (message.type === 'session_created' && message.sessionId) {
        setSessionId(message.sessionId);
      }

      // Handle errors
      if (message.type === 'error' && message.error) {
        setError(message.error);
      }
    });

    return unsubscribe;
  }, []);

  // Connect to Yellow Network
  const connect = useCallback(async () => {
    if (!walletConnected || !address) {
      setError('Wallet not connected');
      return;
    }

    try {
      setError(null);
      await clientRef.current.connect();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      setError(errorMessage);
      throw err;
    }
  }, [walletConnected, address]);

  // Disconnect from Yellow Network
  const disconnect = useCallback(() => {
    clientRef.current.disconnect();
    setSessionId(null);
    setMessages([]);
    setLastMessage(null);
  }, []);

  // Create a payment session
  const createSession = useCallback(async (
    partnerAddress: string,
    allocations: { user: string; partner: string; asset: string }
  ): Promise<string> => {
    if (status !== 'connected') {
      throw new Error('Not connected to Yellow Network');
    }

    try {
      setError(null);
      const newSessionId = await clientRef.current.createPaymentSession(
        partnerAddress,
        allocations
      );
      setSessionId(newSessionId);
      return newSessionId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create session';
      setError(errorMessage);
      throw err;
    }
  }, [status]);

  // Send an instant payment
  const sendPayment = useCallback(async (amount: string, recipient: string) => {
    if (status !== 'connected') {
      throw new Error('Not connected to Yellow Network');
    }

    try {
      setError(null);
      await clientRef.current.sendPayment(amount, recipient);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Payment failed';
      setError(errorMessage);
      throw err;
    }
  }, [status]);

  return {
    status,
    isConnected: status === 'connected',
    sessionId,
    connect,
    disconnect,
    createSession,
    sendPayment,
    messages,
    lastMessage,
    error,
  };
}
