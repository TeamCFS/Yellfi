// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "v4-core/types/PoolKey.sol";

/// @title IYellFi Interface Definitions
/// @notice Core interfaces for YellFi strategy agent system

interface IStrategyAgent {
    enum RuleType {
        REBALANCE_THRESHOLD,    // Rebalance when price moves X%
        TIME_WEIGHTED,          // Execute at intervals
        LIQUIDITY_RANGE,        // Adjust LP range
        STOP_LOSS,              // Exit position at threshold
        TAKE_PROFIT,            // Take profit at target
        CUSTOM_HOOK_SIGNAL      // React to hook signals
    }

    enum AgentStatus {
        INACTIVE,
        ACTIVE,
        PAUSED,
        LIQUIDATED
    }

    struct Rule {
        RuleType ruleType;
        uint256 threshold;      // Basis points (10000 = 100%)
        uint256 targetValue;    // Target for the rule
        uint256 cooldown;       // Minimum time between executions
        uint256 lastExecuted;   // Timestamp of last execution
        bool enabled;
    }

    struct AgentConfig {
        address owner;
        string ensName;         // ENS subname identifier
        PoolKey poolKey;        // Uniswap v4 pool
        AgentStatus status;
        uint256 depositedAmount;
        uint256 createdAt;
        uint256 lastActivity;
    }

    event AgentCreated(uint256 indexed agentId, address indexed owner, string ensName);
    event RuleAdded(uint256 indexed agentId, uint256 ruleIndex, RuleType ruleType);
    event RuleUpdated(uint256 indexed agentId, uint256 ruleIndex);
    event RuleTriggered(uint256 indexed agentId, uint256 ruleIndex, uint256 timestamp);
    event AgentExecuted(uint256 indexed agentId, bytes32 executionId, uint256 amountIn, uint256 amountOut);
    event AgentStatusChanged(uint256 indexed agentId, AgentStatus oldStatus, AgentStatus newStatus);
    event Deposited(uint256 indexed agentId, address token, uint256 amount);
    event Withdrawn(uint256 indexed agentId, address token, uint256 amount);

    function createAgent(
        string calldata ensName,
        PoolKey calldata poolKey,
        Rule[] calldata rules
    ) external returns (uint256 agentId);

    function addRule(uint256 agentId, Rule calldata rule) external;
    function updateRule(uint256 agentId, uint256 ruleIndex, Rule calldata rule) external;
    function removeRule(uint256 agentId, uint256 ruleIndex) external;
    
    function deposit(uint256 agentId, address token, uint256 amount) external;
    function withdraw(uint256 agentId, address token, uint256 amount) external;
    
    function execute(uint256 agentId, uint256 ruleIndex, bytes calldata executionData) external;
    function pause(uint256 agentId) external;
    function unpause(uint256 agentId) external;
    
    function getAgent(uint256 agentId) external view returns (AgentConfig memory);
    function getRules(uint256 agentId) external view returns (Rule[] memory);
    function canExecute(uint256 agentId, uint256 ruleIndex) external view returns (bool);
}

interface IYellFiHook {
    enum SignalType {
        PRICE_IMPACT,           // Large price movement detected
        LIQUIDITY_CHANGE,       // Significant liquidity added/removed
        VOLATILITY_SPIKE,       // High volatility detected
        ARBITRAGE_OPPORTUNITY,  // Cross-pool arbitrage signal
        REBALANCE_NEEDED        // Position needs rebalancing
    }

    struct HookSignal {
        SignalType signalType;
        uint256 magnitude;      // Signal strength (basis points)
        uint256 timestamp;
        bytes32 poolId;
        bytes additionalData;
    }

    event SignalEmitted(
        bytes32 indexed poolId,
        SignalType indexed signalType,
        uint256 magnitude,
        uint256 timestamp
    );

    event AgentNotified(
        uint256 indexed agentId,
        bytes32 indexed poolId,
        SignalType signalType
    );

    function getLatestSignal(bytes32 poolId) external view returns (HookSignal memory);
    function getSignalHistory(bytes32 poolId, uint256 count) external view returns (HookSignal[] memory);
    function subscribeAgent(uint256 agentId, bytes32 poolId) external;
    function unsubscribeAgent(uint256 agentId, bytes32 poolId) external;
}

interface IYellowExecutorAdapter {
    struct ExecutionRequest {
        uint256 agentId;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        bytes routeData;        // Yellow SDK route encoding
    }

    struct ExecutionResult {
        bytes32 executionId;
        uint256 amountIn;
        uint256 amountOut;
        uint256 gasUsed;
        uint256 timestamp;
        bool success;
    }

    event ExecutionRequested(
        bytes32 indexed executionId,
        uint256 indexed agentId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    );

    event ExecutionCompleted(
        bytes32 indexed executionId,
        uint256 indexed agentId,
        uint256 amountOut,
        bool success
    );

    function execute(ExecutionRequest calldata request) external returns (ExecutionResult memory);
    function getExecution(bytes32 executionId) external view returns (ExecutionResult memory);
    function estimateExecution(ExecutionRequest calldata request) external view returns (uint256 estimatedOut);
}

interface IEnsSubnameMinter {
    event SubnameRegistered(
        bytes32 indexed parentNode,
        bytes32 indexed labelHash,
        address indexed owner,
        string fullName
    );

    event SubnameTransferred(
        bytes32 indexed node,
        address indexed from,
        address indexed to
    );

    function registerSubname(
        string calldata label,
        address owner,
        uint256 agentId
    ) external returns (bytes32 node);

    function getAgentByName(string calldata fullName) external view returns (uint256 agentId);
    function getNameByAgent(uint256 agentId) external view returns (string memory);
    function isNameAvailable(string calldata label) external view returns (bool);
}
