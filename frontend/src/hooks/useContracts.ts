import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { useCallback, useMemo } from 'react';
import { CONTRACTS } from '@/config';
import { type Address, maxUint256 } from 'viem';

// ERC20 ABI for approval and balance
const erc20ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// Full ABI for StrategyAgent contract
export const strategyAgentABI = [
  // Events
  {
    type: 'event',
    name: 'AgentCreated',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'ensName', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RuleTriggered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'ruleIndex', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AgentExecuted',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'executionId', type: 'bytes32', indexed: false },
      { name: 'amountIn', type: 'uint256', indexed: false },
      { name: 'amountOut', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AgentStatusChanged',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'oldStatus', type: 'uint8', indexed: false },
      { name: 'newStatus', type: 'uint8', indexed: false },
    ],
  },
  // Read functions
  {
    type: 'function',
    name: 'totalAgents',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgent',
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
  {
    type: 'function',
    name: 'getRules',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple[]',
        components: [
          { name: 'ruleType', type: 'uint8' },
          { name: 'threshold', type: 'uint256' },
          { name: 'targetValue', type: 'uint256' },
          { name: 'cooldown', type: 'uint256' },
          { name: 'lastExecuted', type: 'uint256' },
          { name: 'enabled', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentsByOwner',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentBalance',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'canExecute',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'ruleIndex', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentByEns',
    inputs: [{ name: 'ensName', type: 'string' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  // Write functions
  {
    type: 'function',
    name: 'createAgent',
    inputs: [
      { name: 'ensName', type: 'string' },
      { name: 'poolKey', type: 'tuple', components: [
        { name: 'currency0', type: 'address' },
        { name: 'currency1', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'tickSpacing', type: 'int24' },
        { name: 'hooks', type: 'address' },
      ]},
      { name: 'rules', type: 'tuple[]', components: [
        { name: 'ruleType', type: 'uint8' },
        { name: 'threshold', type: 'uint256' },
        { name: 'targetValue', type: 'uint256' },
        { name: 'cooldown', type: 'uint256' },
        { name: 'lastExecuted', type: 'uint256' },
        { name: 'enabled', type: 'bool' },
      ]},
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'addRule',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'rule', type: 'tuple', components: [
        { name: 'ruleType', type: 'uint8' },
        { name: 'threshold', type: 'uint256' },
        { name: 'targetValue', type: 'uint256' },
        { name: 'cooldown', type: 'uint256' },
        { name: 'lastExecuted', type: 'uint256' },
        { name: 'enabled', type: 'bool' },
      ]},
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'updateRule',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'ruleIndex', type: 'uint256' },
      { name: 'rule', type: 'tuple', components: [
        { name: 'ruleType', type: 'uint8' },
        { name: 'threshold', type: 'uint256' },
        { name: 'targetValue', type: 'uint256' },
        { name: 'cooldown', type: 'uint256' },
        { name: 'lastExecuted', type: 'uint256' },
        { name: 'enabled', type: 'bool' },
      ]},
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeRule',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'ruleIndex', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'pause',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'unpause',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// ENS Subname Minter ABI
export const ensSubnameMinterABI = [
  {
    type: 'function',
    name: 'isNameAvailable',
    inputs: [{ name: 'label', type: 'string' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentByName',
    inputs: [{ name: 'fullName', type: 'string' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getNameByAgent',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
] as const;

// Types
export interface AgentConfig {
  owner: Address;
  ensName: string;
  poolKey: {
    currency0: Address;
    currency1: Address;
    fee: number;
    tickSpacing: number;
    hooks: Address;
  };
  status: number;
  depositedAmount: bigint;
  createdAt: bigint;
  lastActivity: bigint;
}

export interface Rule {
  ruleType: number;
  threshold: bigint;
  targetValue: bigint;
  cooldown: bigint;
  lastExecuted: bigint;
  enabled: boolean;
}

export type AgentStatus = 'INACTIVE' | 'ACTIVE' | 'PAUSED' | 'LIQUIDATED';

export const AGENT_STATUS_MAP: Record<number, AgentStatus> = {
  0: 'INACTIVE',
  1: 'ACTIVE',
  2: 'PAUSED',
  3: 'LIQUIDATED',
};

export const RULE_TYPE_MAP: Record<number, string> = {
  0: 'REBALANCE_THRESHOLD',
  1: 'TIME_WEIGHTED',
  2: 'LIQUIDITY_RANGE',
  3: 'STOP_LOSS',
  4: 'TAKE_PROFIT',
  5: 'CUSTOM_HOOK_SIGNAL',
};

// Hooks

export function useTotalAgents() {
  return useReadContract({
    address: CONTRACTS.strategyAgent,
    abi: strategyAgentABI,
    functionName: 'totalAgents',
  });
}

export function useAgent(agentId: bigint | undefined) {
  return useReadContract({
    address: CONTRACTS.strategyAgent,
    abi: strategyAgentABI,
    functionName: 'getAgent',
    args: agentId !== undefined ? [agentId] : undefined,
    query: {
      enabled: agentId !== undefined,
    },
  });
}

export function useAgentRules(agentId: bigint | undefined) {
  return useReadContract({
    address: CONTRACTS.strategyAgent,
    abi: strategyAgentABI,
    functionName: 'getRules',
    args: agentId !== undefined ? [agentId] : undefined,
    query: {
      enabled: agentId !== undefined,
    },
  });
}

export function useAgentsByOwner(owner: Address | undefined) {
  return useReadContract({
    address: CONTRACTS.strategyAgent,
    abi: strategyAgentABI,
    functionName: 'getAgentsByOwner',
    args: owner ? [owner] : undefined,
    query: {
      enabled: !!owner,
    },
  });
}

export function useCanExecute(agentId: bigint | undefined, ruleIndex: bigint | undefined) {
  return useReadContract({
    address: CONTRACTS.strategyAgent,
    abi: strategyAgentABI,
    functionName: 'canExecute',
    args: agentId !== undefined && ruleIndex !== undefined ? [agentId, ruleIndex] : undefined,
    query: {
      enabled: agentId !== undefined && ruleIndex !== undefined,
    },
  });
}

export function useIsNameAvailable(name: string | undefined) {
  return useReadContract({
    address: CONTRACTS.ensSubnameMinter,
    abi: ensSubnameMinterABI,
    functionName: 'isNameAvailable',
    args: name ? [name] : undefined,
    query: {
      enabled: !!name && name.length >= 3,
    },
  });
}

// Hook to fetch multiple agents by their IDs
export function useMultipleAgents(agentIds: bigint[]) {
  const results = agentIds.map(id => 
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useReadContract({
      address: CONTRACTS.strategyAgent,
      abi: strategyAgentABI,
      functionName: 'getAgent',
      args: [id],
    })
  );

  const isLoading = results.some(r => r.isLoading);
  const isError = results.some(r => r.isError);
  const data = results.map((r, i) => ({
    id: agentIds[i],
    data: r.data as AgentConfig | undefined,
    isLoading: r.isLoading,
    isError: r.isError,
  }));

  return { data, isLoading, isError };
}

// Hook for user's agents with full data
export function useUserAgents() {
  const { address } = useAccount();
  const { data: agentIds, isLoading: idsLoading, refetch: refetchIds } = useAgentsByOwner(address);

  const agents = useMemo(() => {
    if (!agentIds || agentIds.length === 0) return [];
    return agentIds.map(id => BigInt(id));
  }, [agentIds]);

  return {
    agentIds: agents,
    isLoading: idsLoading,
    refetch: refetchIds,
    hasAgents: agents.length > 0,
  };
}

// Write hooks

export function useCreateAgent() {
  const { writeContractAsync, data: hash, isPending, isError, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError: isConfirmError, error: confirmError } = useWaitForTransactionReceipt({ hash });

  const createAgent = useCallback(
    async (
      ensName: string,
      poolKey: {
        currency0: Address;
        currency1: Address;
        fee: number;
        tickSpacing: number;
        hooks: Address;
      },
      rules: Array<{
        ruleType: number;
        threshold: bigint;
        targetValue: bigint;
        cooldown: bigint;
        lastExecuted: bigint;
        enabled: boolean;
      }>
    ) => {
      try {
        const txHash = await writeContractAsync({
          address: CONTRACTS.strategyAgent,
          abi: strategyAgentABI,
          functionName: 'createAgent',
          args: [ensName, poolKey, rules],
        });
        return txHash;
      } catch (err) {
        console.error('Transaction failed:', err);
        throw err;
      }
    },
    [writeContractAsync]
  );

  // Combine errors from both write and confirmation
  const combinedError = error || confirmError;
  const combinedIsError = isError || isConfirmError;

  return {
    createAgent,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    isError: combinedIsError,
    error: combinedError,
    reset,
  };
}

export function usePauseAgent() {
  const { writeContractAsync, data: hash, isPending, isError, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const pauseAgent = useCallback(
    async (agentId: bigint) => {
      try {
        return await writeContractAsync({
          address: CONTRACTS.strategyAgent,
          abi: strategyAgentABI,
          functionName: 'pause',
          args: [agentId],
        });
      } catch (err) {
        console.error('Pause failed:', err);
        throw err;
      }
    },
    [writeContractAsync]
  );

  return { pauseAgent, hash, isPending, isConfirming, isSuccess, isError, error, reset };
}

export function useUnpauseAgent() {
  const { writeContractAsync, data: hash, isPending, isError, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const unpauseAgent = useCallback(
    async (agentId: bigint) => {
      try {
        return await writeContractAsync({
          address: CONTRACTS.strategyAgent,
          abi: strategyAgentABI,
          functionName: 'unpause',
          args: [agentId],
        });
      } catch (err) {
        console.error('Unpause failed:', err);
        throw err;
      }
    },
    [writeContractAsync]
  );

  return { unpauseAgent, hash, isPending, isConfirming, isSuccess, isError, error, reset };
}

export function useUpdateRule() {
  const { writeContractAsync, data: hash, isPending, isError, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const updateRule = useCallback(
    async (
      agentId: bigint,
      ruleIndex: bigint,
      rule: {
        ruleType: number;
        threshold: bigint;
        targetValue: bigint;
        cooldown: bigint;
        lastExecuted: bigint;
        enabled: boolean;
      }
    ) => {
      try {
        return await writeContractAsync({
          address: CONTRACTS.strategyAgent,
          abi: strategyAgentABI,
          functionName: 'updateRule',
          args: [agentId, ruleIndex, rule],
        });
      } catch (err) {
        console.error('Update rule failed:', err);
        throw err;
      }
    },
    [writeContractAsync]
  );

  return { updateRule, hash, isPending, isConfirming, isSuccess, isError, error, reset };
}

export function useAddRule() {
  const { writeContractAsync, data: hash, isPending, isError, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const addRule = useCallback(
    async (
      agentId: bigint,
      rule: {
        ruleType: number;
        threshold: bigint;
        targetValue: bigint;
        cooldown: bigint;
        lastExecuted: bigint;
        enabled: boolean;
      }
    ) => {
      try {
        return await writeContractAsync({
          address: CONTRACTS.strategyAgent,
          abi: strategyAgentABI,
          functionName: 'addRule',
          args: [agentId, rule],
        });
      } catch (err) {
        console.error('Add rule failed:', err);
        throw err;
      }
    },
    [writeContractAsync]
  );

  return { addRule, hash, isPending, isConfirming, isSuccess, isError, error, reset };
}

export function useRemoveRule() {
  const { writeContractAsync, data: hash, isPending, isError, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const removeRule = useCallback(
    async (agentId: bigint, ruleIndex: bigint) => {
      try {
        return await writeContractAsync({
          address: CONTRACTS.strategyAgent,
          abi: strategyAgentABI,
          functionName: 'removeRule',
          args: [agentId, ruleIndex],
        });
      } catch (err) {
        console.error('Remove rule failed:', err);
        throw err;
      }
    },
    [writeContractAsync]
  );

  return { removeRule, hash, isPending, isConfirming, isSuccess, isError, error, reset };
}

// Hook to approve ERC20 tokens
export function useApproveToken() {
  const { writeContractAsync, data: hash, isPending, isError, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = useCallback(
    async (token: `0x${string}`, spender: `0x${string}`, amount: bigint = maxUint256) => {
      try {
        return await writeContractAsync({
          address: token,
          abi: erc20ABI,
          functionName: 'approve',
          args: [spender, amount],
        });
      } catch (err) {
        console.error('Approval failed:', err);
        throw err;
      }
    },
    [writeContractAsync]
  );

  return { approve, hash, isPending, isConfirming, isSuccess, isError, error, reset };
}

// Hook to check token allowance
export function useTokenAllowance(token: `0x${string}` | undefined, owner: Address | undefined) {
  return useReadContract({
    address: token,
    abi: erc20ABI,
    functionName: 'allowance',
    args: owner ? [owner, CONTRACTS.strategyAgent] : undefined,
    query: {
      enabled: !!token && !!owner && token !== '0x0000000000000000000000000000000000000000',
    },
  });
}

// Hook to get user's token balance (ERC20)
export function useTokenBalance(token: `0x${string}` | undefined, account: Address | undefined) {
  return useReadContract({
    address: token,
    abi: erc20ABI,
    functionName: 'balanceOf',
    args: account ? [account] : undefined,
    query: {
      enabled: !!token && !!account && token !== '0x0000000000000000000000000000000000000000',
    },
  });
}

// Hook to get agent's balance for a specific token
export function useAgentTokenBalance(agentId: bigint | undefined, token: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.strategyAgent,
    abi: strategyAgentABI,
    functionName: 'getAgentBalance',
    args: agentId !== undefined && token ? [agentId, token] : undefined,
    query: {
      enabled: agentId !== undefined && !!token,
    },
  });
}

// Hook to deposit tokens to an agent
export function useDeposit() {
  const { writeContractAsync, data: hash, isPending, isError, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const deposit = useCallback(
    async (agentId: bigint, token: `0x${string}`, amount: bigint) => {
      try {
        return await writeContractAsync({
          address: CONTRACTS.strategyAgent,
          abi: strategyAgentABI,
          functionName: 'deposit',
          args: [agentId, token, amount],
        });
      } catch (err) {
        console.error('Deposit failed:', err);
        throw err;
      }
    },
    [writeContractAsync]
  );

  return { deposit, hash, isPending, isConfirming, isSuccess, isError, error, reset };
}

// Hook to withdraw tokens from an agent
export function useWithdraw() {
  const { writeContractAsync, data: hash, isPending, isError, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const withdraw = useCallback(
    async (agentId: bigint, token: `0x${string}`, amount: bigint) => {
      try {
        return await writeContractAsync({
          address: CONTRACTS.strategyAgent,
          abi: strategyAgentABI,
          functionName: 'withdraw',
          args: [agentId, token, amount],
        });
      } catch (err) {
        console.error('Withdraw failed:', err);
        throw err;
      }
    },
    [writeContractAsync]
  );

  return { withdraw, hash, isPending, isConfirming, isSuccess, isError, error, reset };
}
