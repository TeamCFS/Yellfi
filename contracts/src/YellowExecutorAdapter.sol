// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IYellowExecutorAdapter} from "./interfaces/IYellFi.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";

/// @title IPoolSwapTest
/// @notice Interface for Uniswap V4 PoolSwapTest contract
interface IPoolSwapTest {
    struct TestSettings {
        bool takeClaims;
        bool settleUsingBurn;
    }

    function swap(
        PoolKey memory key,
        IPoolManager.SwapParams memory params,
        TestSettings memory testSettings,
        bytes memory hookData
    ) external payable returns (BalanceDelta delta);
}

/// @title YellowExecutorAdapter
/// @notice Adapter for executing swaps via Uniswap V4 PoolSwapTest
/// @dev Bridges on-chain strategy agents with Uniswap V4 pools
contract YellowExecutorAdapter is IYellowExecutorAdapter, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Execution tracking
    mapping(bytes32 => ExecutionResult) private _executions;
    uint256 private _executionNonce;
    
    // Authorized callers (strategy agent contracts)
    mapping(address => bool) public authorizedCallers;
    
    // Uniswap V4 contracts
    IPoolSwapTest public poolSwapTest;
    
    // Yellow SDK router address (for future use)
    address public yellowRouter;
    
    // Fee configuration
    uint256 public protocolFeeBps = 10; // 0.1% default
    uint256 public constant MAX_FEE_BPS = 100; // 1% max
    uint256 public constant BASIS_POINTS = 10_000;
    
    address public feeRecipient;
    
    // Slippage protection
    uint256 public maxSlippageBps = 500; // 5% default max slippage
    
    // Test mode - when false, executes real swaps via Uniswap V4
    bool public testMode = false;
    
    // Pool configurations
    mapping(address => mapping(address => PoolKey)) public poolKeys;
    uint24 public defaultFee = 3000;
    int24 public defaultTickSpacing = 60;

    event CallerAuthorized(address indexed caller, bool authorized);
    event YellowRouterUpdated(address indexed oldRouter, address indexed newRouter);
    event ProtocolFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event TestModeUpdated(bool enabled);
    event PoolSwapTestUpdated(address indexed oldSwapTest, address indexed newSwapTest);
    event PoolKeySet(address indexed token0, address indexed token1, uint24 fee);
    event SwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender], "Not authorized");
        _;
    }

    constructor(
        address _yellowRouter,
        address _feeRecipient,
        address _owner
    ) Ownable(_owner) {
        yellowRouter = _yellowRouter;
        feeRecipient = _feeRecipient;
    }
    
    /// @notice Set the PoolSwapTest contract address
    function setPoolSwapTest(address _poolSwapTest) external onlyOwner {
        address oldSwapTest = address(poolSwapTest);
        poolSwapTest = IPoolSwapTest(_poolSwapTest);
        emit PoolSwapTestUpdated(oldSwapTest, _poolSwapTest);
    }
    
    /// @notice Set pool key for a token pair
    function setPoolKey(
        address token0,
        address token1,
        uint24 fee,
        int24 tickSpacing,
        address hooks
    ) external onlyOwner {
        require(token0 < token1, "Token0 must be < token1");
        
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: IHooks(hooks)
        });
        
        poolKeys[token0][token1] = key;
        poolKeys[token1][token0] = key;
        
        emit PoolKeySet(token0, token1, fee);
    }
    
    /// @notice Set default pool parameters
    function setDefaultPoolParams(uint24 _fee, int24 _tickSpacing) external onlyOwner {
        defaultFee = _fee;
        defaultTickSpacing = _tickSpacing;
    }
    
    /// @notice Enable or disable test mode
    function setTestMode(bool _testMode) external onlyOwner {
        testMode = _testMode;
        emit TestModeUpdated(_testMode);
    }

    /// @notice Execute a swap via Yellow SDK routing
    /// @param request The execution request with routing data
    /// @return result The execution result
    function execute(
        ExecutionRequest calldata request
    ) external override nonReentrant onlyAuthorized returns (ExecutionResult memory result) {
        require(request.amountIn > 0, "Amount must be > 0");
        require(request.tokenIn != address(0), "Invalid tokenIn");
        require(request.tokenOut != address(0), "Invalid tokenOut");
        require(request.tokenIn != request.tokenOut, "Same token");
        
        // Generate execution ID
        bytes32 executionId = keccak256(
            abi.encodePacked(
                request.agentId,
                request.tokenIn,
                request.tokenOut,
                request.amountIn,
                block.timestamp,
                _executionNonce++
            )
        );
        
        emit ExecutionRequested(
            executionId,
            request.agentId,
            request.tokenIn,
            request.tokenOut,
            request.amountIn
        );
        
        uint256 gasStart = gasleft();
        uint256 amountOut;
        
        if (testMode) {
            // Test mode: simulate swap without actual token transfers
            // Just calculate the expected output (0.3% fee simulation)
            uint256 feeAmount = (request.amountIn * protocolFeeBps) / BASIS_POINTS;
            uint256 swapAmount = request.amountIn - feeAmount;
            uint256 swapFee = (swapAmount * 30) / BASIS_POINTS; // 0.3% swap fee
            amountOut = swapAmount - swapFee;
            
            // In test mode, we don't transfer tokens - just emit events
            // The StrategyAgent will update its internal balances
        } else {
            // Production mode: actual token transfers
            // Transfer tokens from caller
            IERC20(request.tokenIn).safeTransferFrom(msg.sender, address(this), request.amountIn);
            
            // Calculate protocol fee
            uint256 feeAmount = (request.amountIn * protocolFeeBps) / BASIS_POINTS;
            uint256 swapAmount = request.amountIn - feeAmount;
            
            // Transfer fee
            if (feeAmount > 0 && feeRecipient != address(0)) {
                IERC20(request.tokenIn).safeTransfer(feeRecipient, feeAmount);
            }
            
            // Execute swap via Yellow router
            amountOut = _executeSwap(
                request.tokenIn,
                request.tokenOut,
                swapAmount,
                request.minAmountOut,
                request.routeData
            );
            
            // Validate slippage
            require(amountOut >= request.minAmountOut, "Slippage exceeded");
            
            // Transfer output to caller
            IERC20(request.tokenOut).safeTransfer(msg.sender, amountOut);
        }
        
        uint256 gasUsed = gasStart - gasleft();
        
        result = ExecutionResult({
            executionId: executionId,
            amountIn: request.amountIn,
            amountOut: amountOut,
            gasUsed: gasUsed,
            timestamp: block.timestamp,
            success: true
        });
        
        _executions[executionId] = result;
        
        emit ExecutionCompleted(executionId, request.agentId, amountOut, true);
    }

    /// @notice Estimate output for an execution
    /// @param request The execution request
    /// @return estimatedOut The estimated output amount
    function estimateExecution(
        ExecutionRequest calldata request
    ) external view override returns (uint256 estimatedOut) {
        require(request.amountIn > 0, "Amount must be > 0");
        
        uint256 feeAmount = (request.amountIn * protocolFeeBps) / BASIS_POINTS;
        uint256 swapAmount = request.amountIn - feeAmount;
        
        // Estimate via Yellow router (simplified - actual implementation would call router)
        estimatedOut = _estimateSwap(
            request.tokenIn,
            request.tokenOut,
            swapAmount,
            request.routeData
        );
    }

    /// @notice Get execution result by ID
    function getExecution(
        bytes32 executionId
    ) external view override returns (ExecutionResult memory) {
        return _executions[executionId];
    }

    // Admin functions

    /// @notice Authorize or deauthorize a caller
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
        emit CallerAuthorized(caller, authorized);
    }

    /// @notice Update Yellow router address
    function setYellowRouter(address _yellowRouter) external onlyOwner {
        require(_yellowRouter != address(0), "Invalid router");
        address oldRouter = yellowRouter;
        yellowRouter = _yellowRouter;
        emit YellowRouterUpdated(oldRouter, _yellowRouter);
    }

    /// @notice Update protocol fee
    function setProtocolFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        uint256 oldFee = protocolFeeBps;
        protocolFeeBps = _feeBps;
        emit ProtocolFeeUpdated(oldFee, _feeBps);
    }

    /// @notice Update fee recipient
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        address oldRecipient = feeRecipient;
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(oldRecipient, _feeRecipient);
    }

    /// @notice Update max slippage
    function setMaxSlippage(uint256 _maxSlippageBps) external onlyOwner {
        require(_maxSlippageBps <= BASIS_POINTS, "Invalid slippage");
        maxSlippageBps = _maxSlippageBps;
    }

    /// @notice Rescue stuck tokens
    function rescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    // Internal functions

    /// @notice Execute swap via Uniswap V4 PoolSwapTest
    function _executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata /* routeData */
    ) internal returns (uint256 amountOut) {
        require(address(poolSwapTest) != address(0), "PoolSwapTest not set");
        
        // Get pool key
        PoolKey memory key = _getPoolKey(tokenIn, tokenOut);
        
        // Determine swap direction
        bool zeroForOne = tokenIn < tokenOut;
        
        // Approve PoolSwapTest
        IERC20(tokenIn).forceApprove(address(poolSwapTest), amountIn);
        
        // Build swap params - negative amountSpecified = exact input
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(amountIn),
            sqrtPriceLimitX96: zeroForOne 
                ? TickMath.MIN_SQRT_PRICE + 1 
                : TickMath.MAX_SQRT_PRICE - 1
        });
        
        IPoolSwapTest.TestSettings memory settings = IPoolSwapTest.TestSettings({
            takeClaims: false,
            settleUsingBurn: false
        });
        
        // Record balance before
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));
        
        // Execute swap via PoolSwapTest
        BalanceDelta delta = poolSwapTest.swap(key, params, settings, "");
        
        // Calculate amount out
        if (zeroForOne) {
            amountOut = uint256(int256(delta.amount1()));
        } else {
            amountOut = uint256(int256(delta.amount0()));
        }
        
        // Verify with actual balance change
        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        uint256 actualReceived = balanceAfter - balanceBefore;
        if (actualReceived > 0) {
            amountOut = actualReceived;
        }
        
        require(amountOut >= minAmountOut, "Slippage exceeded");
        
        emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
    }
    
    /// @notice Get pool key for token pair
    function _getPoolKey(address tokenIn, address tokenOut) internal view returns (PoolKey memory) {
        (address token0, address token1) = tokenIn < tokenOut 
            ? (tokenIn, tokenOut) 
            : (tokenOut, tokenIn);
        
        PoolKey memory key = poolKeys[token0][token1];
        
        // Use default if not set
        if (Currency.unwrap(key.currency0) == address(0)) {
            key = PoolKey({
                currency0: Currency.wrap(token0),
                currency1: Currency.wrap(token1),
                fee: defaultFee,
                tickSpacing: defaultTickSpacing,
                hooks: IHooks(address(0))
            });
        }
        
        return key;
    }

    /// @notice Estimate swap output
    function _estimateSwap(
        address /* tokenIn */,
        address /* tokenOut */,
        uint256 amountIn,
        bytes calldata /* routeData */
    ) internal pure returns (uint256) {
        // Simplified estimation: assume 0.3% pool fee
        uint256 fee = (amountIn * 30) / BASIS_POINTS;
        return amountIn - fee;
    }
    
    /// @notice Receive ETH for native swaps
    receive() external payable {}
}
