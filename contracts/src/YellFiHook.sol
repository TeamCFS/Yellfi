// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/types/BeforeSwapDelta.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {IYellFiHook} from "./interfaces/IYellFi.sol";

/// @title YellFiHook
/// @notice Uniswap v4 hook that emits signals for strategy agents
/// @dev Monitors swaps and liquidity changes to trigger agent actions
contract YellFiHook is IHooks, IYellFiHook {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager public immutable poolManager;

    // Signal tracking per pool
    mapping(bytes32 => HookSignal[]) private _signalHistory;
    mapping(bytes32 => HookSignal) private _latestSignal;
    
    // Agent subscriptions: poolId => agentId[]
    mapping(bytes32 => uint256[]) private _poolSubscribers;
    mapping(uint256 => mapping(bytes32 => bool)) private _agentSubscriptions;
    
    // Price tracking for volatility detection
    mapping(bytes32 => uint160) private _lastSqrtPriceX96;
    mapping(bytes32 => uint256) private _lastSwapTimestamp;
    
    // Thresholds (in basis points)
    uint256 public constant PRICE_IMPACT_THRESHOLD = 100; // 1%
    uint256 public constant VOLATILITY_THRESHOLD = 500;   // 5%
    uint256 public constant LIQUIDITY_CHANGE_THRESHOLD = 1000; // 10%
    
    uint256 public constant MAX_SIGNAL_HISTORY = 100;
    uint256 public constant BASIS_POINTS = 10_000;

    address public strategyAgent;

    event StrategyAgentSet(address indexed agent);

    modifier onlyPoolManager() {
        require(msg.sender == address(poolManager), "Only pool manager");
        _;
    }

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
    }

    /// @notice Set the strategy agent contract address
    function setStrategyAgent(address _strategyAgent) external {
        require(strategyAgent == address(0), "Already set");
        strategyAgent = _strategyAgent;
        emit StrategyAgentSet(_strategyAgent);
    }

    // ============ IHooks Implementation ============

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        return IHooks.beforeInitialize.selector;
    }

    function afterInitialize(
        address,
        PoolKey calldata key,
        uint160 sqrtPriceX96,
        int24
    ) external onlyPoolManager returns (bytes4) {
        bytes32 poolId = PoolId.unwrap(key.toId());
        _lastSqrtPriceX96[poolId] = sqrtPriceX96;
        _lastSwapTimestamp[poolId] = block.timestamp;
        return IHooks.afterInitialize.selector;
    }

    function beforeAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return IHooks.beforeAddLiquidity.selector;
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external onlyPoolManager returns (bytes4, BalanceDelta) {
        bytes32 poolId = PoolId.unwrap(key.toId());
        
        uint256 liquidityDelta = params.liquidityDelta > 0 
            ? uint256(params.liquidityDelta) 
            : uint256(-params.liquidityDelta);
            
        if (liquidityDelta > 0) {
            _emitSignal(
                poolId, 
                SignalType.LIQUIDITY_CHANGE, 
                liquidityDelta,
                abi.encode(params.tickLower, params.tickUpper)
            );
        }
        
        return (IHooks.afterAddLiquidity.selector, BalanceDelta.wrap(0));
    }

    function beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return IHooks.beforeRemoveLiquidity.selector;
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external onlyPoolManager returns (bytes4, BalanceDelta) {
        bytes32 poolId = PoolId.unwrap(key.toId());
        
        uint256 liquidityDelta = params.liquidityDelta > 0 
            ? uint256(params.liquidityDelta) 
            : uint256(-params.liquidityDelta);
            
        if (liquidityDelta > 0) {
            _emitSignal(
                poolId, 
                SignalType.LIQUIDITY_CHANGE, 
                liquidityDelta,
                abi.encode(params.tickLower, params.tickUpper)
            );
        }
        
        return (IHooks.afterRemoveLiquidity.selector, BalanceDelta.wrap(0));
    }

    function beforeSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata,
        bytes calldata
    ) external onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24) {
        bytes32 poolId = PoolId.unwrap(key.toId());
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());
        _lastSqrtPriceX96[poolId] = sqrtPriceX96;
        
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) external onlyPoolManager returns (bytes4, int128) {
        bytes32 poolId = PoolId.unwrap(key.toId());
        (uint160 newSqrtPriceX96,,,) = poolManager.getSlot0(key.toId());
        
        uint160 oldPrice = _lastSqrtPriceX96[poolId];
        uint256 priceChange = _calculatePriceChange(oldPrice, newSqrtPriceX96);
        
        if (priceChange >= PRICE_IMPACT_THRESHOLD) {
            _emitSignal(poolId, SignalType.PRICE_IMPACT, priceChange, "");
        }
        
        uint256 timeSinceLastSwap = block.timestamp - _lastSwapTimestamp[poolId];
        if (timeSinceLastSwap < 60 && priceChange >= VOLATILITY_THRESHOLD) {
            _emitSignal(poolId, SignalType.VOLATILITY_SPIKE, priceChange, "");
        }
        
        _lastSqrtPriceX96[poolId] = newSqrtPriceX96;
        _lastSwapTimestamp[poolId] = block.timestamp;
        
        return (IHooks.afterSwap.selector, 0);
    }

    function beforeDonate(
        address,
        PoolKey calldata,
        uint256,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return IHooks.beforeDonate.selector;
    }

    function afterDonate(
        address,
        PoolKey calldata,
        uint256,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return IHooks.afterDonate.selector;
    }

    // ============ IYellFiHook Implementation ============

    function subscribeAgent(uint256 agentId, bytes32 poolId) external override {
        require(msg.sender == strategyAgent, "Only strategy agent");
        require(!_agentSubscriptions[agentId][poolId], "Already subscribed");
        
        _poolSubscribers[poolId].push(agentId);
        _agentSubscriptions[agentId][poolId] = true;
    }

    function unsubscribeAgent(uint256 agentId, bytes32 poolId) external override {
        require(msg.sender == strategyAgent, "Only strategy agent");
        require(_agentSubscriptions[agentId][poolId], "Not subscribed");
        
        _agentSubscriptions[agentId][poolId] = false;
        
        uint256[] storage subscribers = _poolSubscribers[poolId];
        for (uint256 i = 0; i < subscribers.length; i++) {
            if (subscribers[i] == agentId) {
                subscribers[i] = subscribers[subscribers.length - 1];
                subscribers.pop();
                break;
            }
        }
    }

    function getLatestSignal(bytes32 poolId) external view override returns (HookSignal memory) {
        return _latestSignal[poolId];
    }

    function getSignalHistory(
        bytes32 poolId, 
        uint256 count
    ) external view override returns (HookSignal[] memory) {
        HookSignal[] storage history = _signalHistory[poolId];
        uint256 length = count > history.length ? history.length : count;
        
        HookSignal[] memory result = new HookSignal[](length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = history[history.length - 1 - i];
        }
        
        return result;
    }

    function getPoolSubscribers(bytes32 poolId) external view returns (uint256[] memory) {
        return _poolSubscribers[poolId];
    }

    function isSubscribed(uint256 agentId, bytes32 poolId) external view returns (bool) {
        return _agentSubscriptions[agentId][poolId];
    }

    // ============ Internal Functions ============

    function _emitSignal(
        bytes32 poolId,
        SignalType signalType,
        uint256 magnitude,
        bytes memory additionalData
    ) internal {
        HookSignal memory signal = HookSignal({
            signalType: signalType,
            magnitude: magnitude,
            timestamp: block.timestamp,
            poolId: poolId,
            additionalData: additionalData
        });
        
        _latestSignal[poolId] = signal;
        
        if (_signalHistory[poolId].length >= MAX_SIGNAL_HISTORY) {
            for (uint256 i = 0; i < MAX_SIGNAL_HISTORY - 1; i++) {
                _signalHistory[poolId][i] = _signalHistory[poolId][i + 1];
            }
            _signalHistory[poolId][MAX_SIGNAL_HISTORY - 1] = signal;
        } else {
            _signalHistory[poolId].push(signal);
        }
        
        emit SignalEmitted(poolId, signalType, magnitude, block.timestamp);
        
        uint256[] memory subscribers = _poolSubscribers[poolId];
        for (uint256 i = 0; i < subscribers.length; i++) {
            emit AgentNotified(subscribers[i], poolId, signalType);
        }
    }

    function _calculatePriceChange(
        uint160 oldSqrtPriceX96,
        uint160 newSqrtPriceX96
    ) internal pure returns (uint256) {
        if (oldSqrtPriceX96 == 0) return 0;
        
        uint256 oldPrice = uint256(oldSqrtPriceX96);
        uint256 newPrice = uint256(newSqrtPriceX96);
        
        uint256 diff = oldPrice > newPrice 
            ? oldPrice - newPrice 
            : newPrice - oldPrice;
            
        return (diff * BASIS_POINTS) / oldPrice;
    }
}
