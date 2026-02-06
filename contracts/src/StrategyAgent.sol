// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IStrategyAgent} from "./interfaces/IYellFi.sol";
import {IYellowExecutorAdapter} from "./interfaces/IYellFi.sol";
import {IEnsSubnameMinter} from "./interfaces/IYellFi.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title StrategyAgent
/// @notice ENS-named DeFi strategy agents with automated rule execution
/// @dev Integrates with Uniswap v4 hooks and Yellow SDK for execution
contract StrategyAgent is IStrategyAgent, ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    uint256 private _nextAgentId = 1;
    
    IYellowExecutorAdapter public immutable executor;
    IEnsSubnameMinter public immutable ensMinter;
    
    mapping(uint256 => AgentConfig) private _agents;
    mapping(uint256 => Rule[]) private _agentRules;
    mapping(uint256 => mapping(address => uint256)) private _agentBalances;
    mapping(string => uint256) private _ensToAgent;
    mapping(address => uint256[]) private _ownerAgents;
    
    // Keeper addresses authorized to execute strategies
    mapping(address => bool) public keepers;
    
    uint256 public constant MAX_RULES_PER_AGENT = 10;
    uint256 public constant MIN_COOLDOWN = 60; // 1 minute minimum

    // Debug events for execution tracing
    event ExecutionStarted(uint256 indexed agentId, uint256 ruleIndex, address tokenIn, address tokenOut, uint256 amountIn);
    event ExecutionApproved(uint256 indexed agentId, address token, address spender, uint256 amount);
    event ExecutionResult(uint256 indexed agentId, bool success, uint256 amountOut);
    uint256 public constant BASIS_POINTS = 10_000;

    modifier onlyAgentOwner(uint256 agentId) {
        require(_agents[agentId].owner == msg.sender, "Not agent owner");
        _;
    }

    modifier onlyKeeperOrOwner(uint256 agentId) {
        require(
            keepers[msg.sender] || _agents[agentId].owner == msg.sender,
            "Not authorized"
        );
        _;
    }

    modifier agentExists(uint256 agentId) {
        require(_agents[agentId].owner != address(0), "Agent does not exist");
        _;
    }

    modifier agentActive(uint256 agentId) {
        require(_agents[agentId].status == AgentStatus.ACTIVE, "Agent not active");
        _;
    }

    constructor(
        address _executor,
        address _ensMinter,
        address _owner
    ) Ownable(_owner) {
        executor = IYellowExecutorAdapter(_executor);
        ensMinter = IEnsSubnameMinter(_ensMinter);
    }

    /// @notice Create a new strategy agent with ENS name
    /// @param ensName Subname for the agent (e.g., "myagent" -> myagent.yellfi.eth)
    /// @param poolKey Uniswap v4 pool to operate on
    /// @param rules Initial rules for the agent
    /// @return agentId The ID of the created agent
    function createAgent(
        string calldata ensName,
        PoolKey calldata poolKey,
        Rule[] calldata rules
    ) external override whenNotPaused returns (uint256 agentId) {
        require(bytes(ensName).length > 0, "ENS name required");
        require(rules.length <= MAX_RULES_PER_AGENT, "Too many rules");
        require(ensMinter.isNameAvailable(ensName), "ENS name taken");

        agentId = _nextAgentId++;

        _agents[agentId] = AgentConfig({
            owner: msg.sender,
            ensName: ensName,
            poolKey: poolKey,
            status: AgentStatus.ACTIVE,
            depositedAmount: 0,
            createdAt: block.timestamp,
            lastActivity: block.timestamp
        });

        for (uint256 i = 0; i < rules.length; i++) {
            _validateRule(rules[i]);
            _agentRules[agentId].push(rules[i]);
            emit RuleAdded(agentId, i, rules[i].ruleType);
        }

        _ensToAgent[ensName] = agentId;
        _ownerAgents[msg.sender].push(agentId);

        // Register ENS subname
        ensMinter.registerSubname(ensName, msg.sender, agentId);

        emit AgentCreated(agentId, msg.sender, ensName);
    }

    /// @notice Add a new rule to an existing agent
    function addRule(
        uint256 agentId,
        Rule calldata rule
    ) external override onlyAgentOwner(agentId) agentExists(agentId) {
        require(_agentRules[agentId].length < MAX_RULES_PER_AGENT, "Max rules reached");
        _validateRule(rule);
        
        _agentRules[agentId].push(rule);
        emit RuleAdded(agentId, _agentRules[agentId].length - 1, rule.ruleType);
    }

    /// @notice Update an existing rule
    function updateRule(
        uint256 agentId,
        uint256 ruleIndex,
        Rule calldata rule
    ) external override onlyAgentOwner(agentId) agentExists(agentId) {
        require(ruleIndex < _agentRules[agentId].length, "Invalid rule index");
        _validateRule(rule);
        
        _agentRules[agentId][ruleIndex] = rule;
        emit RuleUpdated(agentId, ruleIndex);
    }

    /// @notice Remove a rule from an agent
    function removeRule(
        uint256 agentId,
        uint256 ruleIndex
    ) external override onlyAgentOwner(agentId) agentExists(agentId) {
        require(ruleIndex < _agentRules[agentId].length, "Invalid rule index");
        
        // Move last element to deleted position and pop
        uint256 lastIndex = _agentRules[agentId].length - 1;
        if (ruleIndex != lastIndex) {
            _agentRules[agentId][ruleIndex] = _agentRules[agentId][lastIndex];
        }
        _agentRules[agentId].pop();
    }

    /// @notice Deposit tokens into an agent
    function deposit(
        uint256 agentId,
        address token,
        uint256 amount
    ) external override nonReentrant agentExists(agentId) {
        require(amount > 0, "Amount must be > 0");
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _agentBalances[agentId][token] += amount;
        _agents[agentId].depositedAmount += amount;
        _agents[agentId].lastActivity = block.timestamp;

        emit Deposited(agentId, token, amount);
    }

    /// @notice Withdraw tokens from an agent
    function withdraw(
        uint256 agentId,
        address token,
        uint256 amount
    ) external override nonReentrant onlyAgentOwner(agentId) agentExists(agentId) {
        require(_agentBalances[agentId][token] >= amount, "Insufficient balance");
        
        _agentBalances[agentId][token] -= amount;
        _agents[agentId].depositedAmount -= amount;
        _agents[agentId].lastActivity = block.timestamp;
        
        IERC20(token).safeTransfer(msg.sender, amount);

        emit Withdrawn(agentId, token, amount);
    }

    /// @notice Execute a strategy rule
    /// @param agentId The agent to execute
    /// @param ruleIndex The rule that triggered execution
    /// @param executionData Encoded execution parameters from Yellow SDK
    function execute(
        uint256 agentId,
        uint256 ruleIndex,
        bytes calldata executionData
    ) external override nonReentrant onlyKeeperOrOwner(agentId) agentActive(agentId) {
        require(canExecute(agentId, ruleIndex), "Cannot execute: cooldown or disabled");
        
        Rule storage rule = _agentRules[agentId][ruleIndex];
        rule.lastExecuted = block.timestamp;

        // Decode and execute via Yellow SDK adapter
        IYellowExecutorAdapter.ExecutionRequest memory request = abi.decode(
            executionData,
            (IYellowExecutorAdapter.ExecutionRequest)
        );
        request.agentId = agentId;

        emit ExecutionStarted(agentId, ruleIndex, request.tokenIn, request.tokenOut, request.amountIn);

        // Validate sufficient balance
        require(
            _agentBalances[agentId][request.tokenIn] >= request.amountIn,
            "Insufficient agent balance"
        );

        // Approve executor for token transfer (use forceApprove for compatibility)
        IERC20(request.tokenIn).forceApprove(address(executor), request.amountIn);
        emit ExecutionApproved(agentId, request.tokenIn, address(executor), request.amountIn);
        
        IYellowExecutorAdapter.ExecutionResult memory result = executor.execute(request);
        emit ExecutionResult(agentId, result.success, result.amountOut);
        
        require(result.success, "Executor failed");

        // Update balances
        _agentBalances[agentId][request.tokenIn] -= request.amountIn;
        _agentBalances[agentId][request.tokenOut] += result.amountOut;
        _agents[agentId].lastActivity = block.timestamp;

        emit RuleTriggered(agentId, ruleIndex, block.timestamp);
        emit AgentExecuted(agentId, result.executionId, result.amountIn, result.amountOut);
    }

    /// @notice Pause an agent
    function pause(uint256 agentId) external override onlyAgentOwner(agentId) agentExists(agentId) {
        AgentStatus oldStatus = _agents[agentId].status;
        _agents[agentId].status = AgentStatus.PAUSED;
        emit AgentStatusChanged(agentId, oldStatus, AgentStatus.PAUSED);
    }

    /// @notice Unpause an agent
    function unpause(uint256 agentId) external override onlyAgentOwner(agentId) agentExists(agentId) {
        require(_agents[agentId].status == AgentStatus.PAUSED, "Not paused");
        _agents[agentId].status = AgentStatus.ACTIVE;
        emit AgentStatusChanged(agentId, AgentStatus.PAUSED, AgentStatus.ACTIVE);
    }

    /// @notice Check if a rule can be executed
    function canExecute(
        uint256 agentId,
        uint256 ruleIndex
    ) public view override agentExists(agentId) returns (bool) {
        if (_agents[agentId].status != AgentStatus.ACTIVE) return false;
        if (ruleIndex >= _agentRules[agentId].length) return false;
        
        Rule memory rule = _agentRules[agentId][ruleIndex];
        if (!rule.enabled) return false;
        if (block.timestamp < rule.lastExecuted + rule.cooldown) return false;
        
        return true;
    }

    /// @notice Get agent configuration
    function getAgent(uint256 agentId) external view override returns (AgentConfig memory) {
        return _agents[agentId];
    }

    /// @notice Get all rules for an agent
    function getRules(uint256 agentId) external view override returns (Rule[] memory) {
        return _agentRules[agentId];
    }

    /// @notice Get agent balance for a token
    function getAgentBalance(uint256 agentId, address token) external view returns (uint256) {
        return _agentBalances[agentId][token];
    }

    /// @notice Get agent ID by ENS name
    function getAgentByEns(string calldata ensName) external view returns (uint256) {
        return _ensToAgent[ensName];
    }

    /// @notice Get all agents owned by an address
    function getAgentsByOwner(address owner) external view returns (uint256[] memory) {
        return _ownerAgents[owner];
    }

    /// @notice Get total number of agents
    function totalAgents() external view returns (uint256) {
        return _nextAgentId - 1;
    }

    // Admin functions

    /// @notice Add or remove a keeper
    function setKeeper(address keeper, bool status) external onlyOwner {
        keepers[keeper] = status;
    }

    /// @notice Emergency pause all operations
    function emergencyPause() external onlyOwner {
        _pause();
    }

    /// @notice Resume operations
    function emergencyUnpause() external onlyOwner {
        _unpause();
    }

    // Internal functions

    function _validateRule(Rule calldata rule) internal pure {
        require(rule.cooldown >= MIN_COOLDOWN, "Cooldown too short");
        require(rule.threshold <= BASIS_POINTS, "Invalid threshold");
    }
}
