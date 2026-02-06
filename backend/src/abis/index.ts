// Contract ABIs for YellFi

export const StrategyAgentABI = [
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
    name: 'totalAgents',
    inputs: [],
    outputs: [{ type: 'uint256' }],
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
  // Write functions
  {
    type: 'function',
    name: 'execute',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'ruleIndex', type: 'uint256' },
      { name: 'executionData', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export const YellFiHookABI = [
  // Events
  {
    type: 'event',
    name: 'SignalEmitted',
    inputs: [
      { name: 'poolId', type: 'bytes32', indexed: true },
      { name: 'signalType', type: 'uint8', indexed: true },
      { name: 'magnitude', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AgentNotified',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'poolId', type: 'bytes32', indexed: true },
      { name: 'signalType', type: 'uint8', indexed: false },
    ],
  },
  // Read functions
  {
    type: 'function',
    name: 'getLatestSignal',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'signalType', type: 'uint8' },
          { name: 'magnitude', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'poolId', type: 'bytes32' },
          { name: 'additionalData', type: 'bytes' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getSignalHistory',
    inputs: [
      { name: 'poolId', type: 'bytes32' },
      { name: 'count', type: 'uint256' },
    ],
    outputs: [
      {
        type: 'tuple[]',
        components: [
          { name: 'signalType', type: 'uint8' },
          { name: 'magnitude', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'poolId', type: 'bytes32' },
          { name: 'additionalData', type: 'bytes' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPoolSubscribers',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ type: 'uint256[]' }],
    stateMutability: 'view',
  },
] as const;

export const YellowExecutorAdapterABI = [
  // Events
  {
    type: 'event',
    name: 'ExecutionRequested',
    inputs: [
      { name: 'executionId', type: 'bytes32', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'tokenIn', type: 'address', indexed: false },
      { name: 'tokenOut', type: 'address', indexed: false },
      { name: 'amountIn', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ExecutionCompleted',
    inputs: [
      { name: 'executionId', type: 'bytes32', indexed: true },
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'amountOut', type: 'uint256', indexed: false },
      { name: 'success', type: 'bool', indexed: false },
    ],
  },
  // Read functions
  {
    type: 'function',
    name: 'estimateExecution',
    inputs: [
      {
        type: 'tuple',
        name: 'request',
        components: [
          { name: 'agentId', type: 'uint256' },
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'minAmountOut', type: 'uint256' },
          { name: 'routeData', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
