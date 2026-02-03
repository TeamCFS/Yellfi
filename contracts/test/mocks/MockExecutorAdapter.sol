// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IYellowExecutorAdapter} from "../../src/interfaces/IYellFi.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockExecutorAdapter is IYellowExecutorAdapter {
    mapping(bytes32 => ExecutionResult) private _executions;
    uint256 private _nonce;

    function execute(
        ExecutionRequest calldata request
    ) external override returns (ExecutionResult memory result) {
        bytes32 executionId = keccak256(
            abi.encodePacked(request.agentId, block.timestamp, _nonce++)
        );

        // Simulate swap: transfer tokens
        IERC20(request.tokenIn).transferFrom(msg.sender, address(this), request.amountIn);
        
        // Calculate output (0.3% fee simulation)
        uint256 amountOut = (request.amountIn * 997) / 1000;
        
        // Transfer output
        IERC20(request.tokenOut).transfer(msg.sender, amountOut);

        result = ExecutionResult({
            executionId: executionId,
            amountIn: request.amountIn,
            amountOut: amountOut,
            gasUsed: 150000,
            timestamp: block.timestamp,
            success: true
        });

        _executions[executionId] = result;

        emit ExecutionRequested(
            executionId,
            request.agentId,
            request.tokenIn,
            request.tokenOut,
            request.amountIn
        );
        emit ExecutionCompleted(executionId, request.agentId, amountOut, true);
    }

    function getExecution(
        bytes32 executionId
    ) external view override returns (ExecutionResult memory) {
        return _executions[executionId];
    }

    function estimateExecution(
        ExecutionRequest calldata request
    ) external pure override returns (uint256) {
        return (request.amountIn * 997) / 1000;
    }

    // Helper to fund the mock with tokens for swaps
    function fundToken(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }
}
