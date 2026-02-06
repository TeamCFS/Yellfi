import { useState, useEffect, useCallback } from 'react';

// Backend API URL - can be configured via environment variable
const API_BASE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BACKEND_URL) || 'http://localhost:3001';

export interface ExecutionRecord {
  id: string;
  agentId: string;
  ruleIndex: number;
  timestamp: number;
  success: boolean;
  transactionHash?: string;
  executionId?: string;
  error?: string;
  executionMode: 'state-channel' | 'on-chain';
  ruleType?: number;
  threshold?: number;
}

export interface BackendStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  stateChannelExecutions: number;
  onChainExecutions: number;
  activeAgents: number;
  uptime: number;
}

export interface AgentStatusFromBackend {
  agentId: string;
  isActive: boolean;
  lastEvaluation: number;
  pendingExecutions: number;
  totalExecutions: number;
}

/**
 * Hook to check backend health
 */
export function useBackendHealth() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        setIsConnected(true);
        setError(null);
      } else {
        setIsConnected(false);
        setError('Backend not responding');
      }
    } catch (err) {
      setIsConnected(false);
      setError('Cannot connect to backend');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [checkHealth]);

  return { isConnected, isLoading, error, refetch: checkHealth };
}

/**
 * Hook to fetch execution history
 */
export function useExecutions(agentId?: string, limit: number = 50) {
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExecutions = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ limit: limit.toString() });
      if (agentId) params.append('agentId', agentId);
      
      const response = await fetch(`${API_BASE_URL}/api/executions?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        const data = await response.json();
        setExecutions(data.executions || []);
        setTotal(data.total || 0);
        setError(null);
      } else {
        setError('Failed to fetch executions');
      }
    } catch (err) {
      setError('Cannot connect to backend');
      setExecutions([]);
    } finally {
      setIsLoading(false);
    }
  }, [agentId, limit]);

  useEffect(() => {
    fetchExecutions();
    const interval = setInterval(fetchExecutions, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [fetchExecutions]);

  return { executions, total, isLoading, error, refetch: fetchExecutions };
}

/**
 * Hook to fetch backend stats
 */
export function useBackendStats() {
  const [stats, setStats] = useState<BackendStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/stats`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data);
        setError(null);
      } else {
        setError('Failed to fetch stats');
      }
    } catch (err) {
      setError('Cannot connect to backend');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000); // Refresh every 15 seconds
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, isLoading, error, refetch: fetchStats };
}

/**
 * Hook to fetch agent statuses from backend
 */
export function useAgentStatuses() {
  const [statuses, setStatuses] = useState<AgentStatusFromBackend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatuses = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/agents/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        const data = await response.json();
        setStatuses(data.agents || []);
        setError(null);
      } else {
        setError('Failed to fetch agent statuses');
      }
    } catch (err) {
      setError('Cannot connect to backend');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 10000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  return { statuses, isLoading, error, refetch: fetchStatuses };
}

// Rule type names for display
export const RULE_TYPE_NAMES: Record<number, string> = {
  0: 'Rebalance Threshold',
  1: 'Time Weighted',
  2: 'Liquidity Range',
  3: 'Stop Loss',
  4: 'Take Profit',
  5: 'Hook Signal',
};

// Format execution for display
export function formatExecution(execution: ExecutionRecord): {
  time: string;
  status: 'success' | 'failed';
  ruleType: string;
  mode: string;
} {
  return {
    time: new Date(execution.timestamp).toLocaleString(),
    status: execution.success ? 'success' : 'failed',
    ruleType: RULE_TYPE_NAMES[execution.ruleType || 0] || `Rule ${execution.ruleIndex}`,
    mode: execution.executionMode === 'state-channel' ? 'Instant (Yellow)' : 'On-chain',
  };
}
