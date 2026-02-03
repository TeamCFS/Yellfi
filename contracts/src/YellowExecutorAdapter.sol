// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IYellowExecutorAdapter} from "./interfaces/IYellFi.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title YellowExecutorAdapter
/// @notice Adapter for executing swaps via Yellow SDK routing
/// @dev Bridges on-chain strategy agents with Yellow SDK off-chain routing
contract YellowExecutorAdapter is IYellowExecutorAdapter, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Execution tracking
    mapping(bytes32 => ExecutionResult) private _executions;
    uint256 private _executionNonce;
    
    // Authorized callers (strategy agent contracts)
    mapping(address => bool) public authorizedCallers;
    
    // Yellow SDK router address (for actual execution)
    address public yellowRouter;
    
    // Fee configuration
    uint256 public protocolFeeBps = 10; // 0.1% default
    uint256 public constant MAX_FEE_BPS = 100; // 1% max
    uint256 public constant BASIS_POINTS = 10_000;
    
    address public feeRecipient;
    
    // Slippage protection
    uint256 public maxSlippageBps = 500; // 5% default max slippage

    event CallerAuthorized(address indexed caller, bool authorized);
    event YellowRouterUpdated(address indexed oldRouter, address indexed newRouter);
    event ProtocolFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

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
        uint256 amountOut = _executeSwap(
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

    /// @notice Execute swap via Yellow SDK router
    /// @dev In production, this calls the actual Yellow SDK router contract
    function _executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata routeData
    ) internal returns (uint256 amountOut) {
        // Approve router
        IERC20(tokenIn).safeIncreaseAllowance(yellowRouter, amountIn);
        
        // In production: call Yellow SDK router with routeData
        // For now: simulate execution (replace with actual router call)
        
        if (yellowRouter != address(0) && routeData.length > 0) {
            // Decode route and execute
            // bytes4 selector = bytes4(routeData[:4]);
            // (bool success, bytes memory result) = yellowRouter.call(routeData);
            // require(success, "Router call failed");
            // amountOut = abi.decode(result, (uint256));
            
            // Placeholder: direct transfer simulation for testing
            // In production, this would be the actual router call
            amountOut = _simulateSwap(tokenIn, tokenOut, amountIn);
        } else {
            // Fallback: simple 1:1 simulation for testing
            amountOut = _simulateSwap(tokenIn, tokenOut, amountIn);
        }
        
        require(amountOut >= minAmountOut, "Insufficient output");
    }

    /// @notice Estimate swap output
    function _estimateSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata /* routeData */
    ) internal view returns (uint256) {
        // In production: call Yellow SDK quote endpoint
        // Simplified estimation for testing
        return _simulateSwapEstimate(tokenIn, tokenOut, amountIn);
    }

    /// @notice Simulate swap for testing (replace with actual router in production)
    function _simulateSwap(
        address /* tokenIn */,
        address tokenOut,
        uint256 amountIn
    ) internal view returns (uint256) {
        // Simple simulation: assume 0.3% fee and 1:1 rate
        // In production, this is replaced by actual Yellow SDK execution
        uint256 fee = (amountIn * 30) / BASIS_POINTS;
        uint256 amountOut = amountIn - fee;
        
        // Check we have enough output tokens (for testing)
        uint256 balance = IERC20(tokenOut).balanceOf(address(this));
        require(balance >= amountOut, "Insufficient liquidity");
        
        return amountOut;
    }

    /// @notice Simulate swap estimate
    function _simulateSwapEstimate(
        address /* tokenIn */,
        address /* tokenOut */,
        uint256 amountIn
    ) internal pure returns (uint256) {
        // Simple estimation: assume 0.3% fee and 1:1 rate
        uint256 fee = (amountIn * 30) / BASIS_POINTS;
        return amountIn - fee;
    }
}
