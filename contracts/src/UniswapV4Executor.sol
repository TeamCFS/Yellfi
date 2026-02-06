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

/// @title UniswapV4Executor
/// @notice Executes swaps on Uniswap V4 pools for strategy agents
/// @dev Integrates with PoolSwapTest contract deployed on Sepolia
contract UniswapV4Executor is IYellowExecutorAdapter, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Execution tracking
    mapping(bytes32 => ExecutionResult) private _executions;
    uint256 private _executionNonce;
    
    // Authorized callers (strategy agent contracts)
    mapping(address => bool) public authorizedCallers;
    
    // Uniswap V4 contracts
    IPoolSwapTest public immutable poolSwapTest;
    IPoolManager public immutable poolManager;
    
    // Fee configuration
    uint256 public protocolFeeBps = 10; // 0.1% default
    uint256 public constant MAX_FEE_BPS = 100; // 1% max
    uint256 public constant BASIS_POINTS = 10_000;
    
    address public feeRecipient;
    
    // Pool configurations: tokenIn => tokenOut => PoolKey
    mapping(address => mapping(address => PoolKey)) public poolKeys;
    
    // Default pool parameters
    uint24 public defaultFee = 3000; // 0.3%
    int24 public defaultTickSpacing = 60;

    event CallerAuthorized(address indexed caller, bool authorized);
    event PoolKeySet(address indexed token0, address indexed token1, uint24 fee, int24 tickSpacing);
    event SwapExecuted(
        bytes32 indexed executionId,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    error InvalidPool();
    error SwapFailed();
    error InsufficientOutput();

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender], "Not authorized");
        _;
    }

    constructor(
        address _poolSwapTest,
        address _poolManager,
        address _feeRecipient,
        address _owner
    ) Ownable(_owner) {
        poolSwapTest = IPoolSwapTest(_poolSwapTest);
        poolManager = IPoolManager(_poolManager);
        feeRecipient = _feeRecipient;
    }

    /// @notice Set pool key for a token pair
    /// @param token0 First token (must be < token1)
    /// @param token1 Second token
    /// @param fee Pool fee in hundredths of a bip
    /// @param tickSpacing Tick spacing for the pool
    /// @param hooks Hook contract address (address(0) for no hooks)
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
        poolKeys[token1][token0] = key; // Store both directions
        
        emit PoolKeySet(token0, token1, fee, tickSpacing);
    }

    /// @notice Execute a swap via Uniswap V4
    /// @param request The execution request
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
        
        // Transfer tokens from caller (StrategyAgent)
        IERC20(request.tokenIn).safeTransferFrom(msg.sender, address(this), request.amountIn);
        
        // Calculate and transfer protocol fee
        uint256 feeAmount = (request.amountIn * protocolFeeBps) / BASIS_POINTS;
        uint256 swapAmount = request.amountIn - feeAmount;
        
        if (feeAmount > 0 && feeRecipient != address(0)) {
            IERC20(request.tokenIn).safeTransfer(feeRecipient, feeAmount);
        }
        
        // Execute swap on Uniswap V4
        uint256 amountOut = _executeV4Swap(
            request.tokenIn,
            request.tokenOut,
            swapAmount,
            request.minAmountOut
        );
        
        // Validate output
        if (amountOut < request.minAmountOut) {
            revert InsufficientOutput();
        }
        
        // Transfer output tokens to caller
        IERC20(request.tokenOut).safeTransfer(msg.sender, amountOut);
        
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
        
        emit SwapExecuted(executionId, request.tokenIn, request.tokenOut, request.amountIn, amountOut);
        emit ExecutionCompleted(executionId, request.agentId, amountOut, true);
    }

    /// @notice Execute swap on Uniswap V4 PoolSwapTest
    function _executeV4Swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        // Get pool key for this pair
        PoolKey memory key = _getPoolKey(tokenIn, tokenOut);
        
        // Determine swap direction
        bool zeroForOne = tokenIn < tokenOut;
        
        // Approve PoolSwapTest to spend tokens
        IERC20(tokenIn).forceApprove(address(poolSwapTest), amountIn);
        
        // Build swap params
        // amountSpecified is negative for exact input swaps
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(amountIn), // Negative = exact input
            sqrtPriceLimitX96: zeroForOne 
                ? TickMath.MIN_SQRT_PRICE + 1 
                : TickMath.MAX_SQRT_PRICE - 1
        });
        
        // Test settings - don't use claims or burn
        IPoolSwapTest.TestSettings memory settings = IPoolSwapTest.TestSettings({
            takeClaims: false,
            settleUsingBurn: false
        });
        
        // Record balance before
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));
        
        // Execute swap
        BalanceDelta delta = poolSwapTest.swap(key, params, settings, "");
        
        // Calculate amount out from delta
        if (zeroForOne) {
            // Swapping token0 for token1, so amount1 is positive (received)
            amountOut = uint256(int256(delta.amount1()));
        } else {
            // Swapping token1 for token0, so amount0 is positive (received)
            amountOut = uint256(int256(delta.amount0()));
        }
        
        // Verify we received tokens
        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        uint256 actualReceived = balanceAfter - balanceBefore;
        
        // Use actual received if delta calculation differs
        if (actualReceived > 0) {
            amountOut = actualReceived;
        }
        
        require(amountOut >= minAmountOut, "Slippage exceeded");
    }

    /// @notice Get pool key for a token pair
    function _getPoolKey(address tokenIn, address tokenOut) internal view returns (PoolKey memory) {
        // Ensure correct token ordering
        (address token0, address token1) = tokenIn < tokenOut 
            ? (tokenIn, tokenOut) 
            : (tokenOut, tokenIn);
        
        PoolKey memory key = poolKeys[token0][token1];
        
        // Check if pool key is set
        if (Currency.unwrap(key.currency0) == address(0)) {
            // Use default pool key
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

    /// @notice Estimate output for an execution
    function estimateExecution(
        ExecutionRequest calldata request
    ) external view override returns (uint256 estimatedOut) {
        require(request.amountIn > 0, "Amount must be > 0");
        
        uint256 feeAmount = (request.amountIn * protocolFeeBps) / BASIS_POINTS;
        uint256 swapAmount = request.amountIn - feeAmount;
        
        // Simplified estimation: assume 0.3% pool fee
        uint256 poolFee = (swapAmount * 30) / BASIS_POINTS;
        estimatedOut = swapAmount - poolFee;
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

    /// @notice Update protocol fee
    function setProtocolFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        protocolFeeBps = _feeBps;
    }

    /// @notice Update fee recipient
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }

    /// @notice Update default pool parameters
    function setDefaultPoolParams(uint24 _fee, int24 _tickSpacing) external onlyOwner {
        defaultFee = _fee;
        defaultTickSpacing = _tickSpacing;
    }

    /// @notice Rescue stuck tokens
    function rescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    /// @notice Receive ETH for native token swaps
    receive() external payable {}
}
