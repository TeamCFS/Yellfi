// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {YellowExecutorAdapter} from "../src/YellowExecutorAdapter.sol";
import {IYellowExecutorAdapter} from "../src/interfaces/IYellFi.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract YellowExecutorAdapterTest is Test {
    YellowExecutorAdapter public adapter;
    MockERC20 public tokenIn;
    MockERC20 public tokenOut;

    address public owner = address(this);
    address public authorizedCaller = address(0x1);
    address public feeRecipient = address(0x2);
    address public yellowRouter = address(0x3);
    address public user = address(0x4);

    function setUp() public {
        tokenIn = new MockERC20("Token In", "TIN");
        tokenOut = new MockERC20("Token Out", "TOUT");

        adapter = new YellowExecutorAdapter(
            yellowRouter,
            feeRecipient,
            owner
        );

        adapter.setAuthorizedCaller(authorizedCaller, true);
        
        // Enable test mode for mock token tests (no real Uniswap V4 needed)
        adapter.setTestMode(true);

        // Fund adapter with output tokens for swaps
        tokenOut.mint(address(adapter), 1000 ether);

        // Fund user with input tokens
        tokenIn.mint(user, 100 ether);

        // Approve adapter
        vm.prank(user);
        tokenIn.approve(address(adapter), type(uint256).max);
    }

    // ============ Execution Tests ============

    function test_Execute() public {
        uint256 amountIn = 10 ether;

        IYellowExecutorAdapter.ExecutionRequest memory request = IYellowExecutorAdapter.ExecutionRequest({
            agentId: 1,
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: amountIn,
            minAmountOut: 9 ether,
            routeData: ""
        });

        // Transfer tokens to authorized caller first
        vm.prank(user);
        tokenIn.transfer(authorizedCaller, amountIn);

        vm.startPrank(authorizedCaller);
        tokenIn.approve(address(adapter), amountIn);
        IYellowExecutorAdapter.ExecutionResult memory result = adapter.execute(request);
        vm.stopPrank();

        assertTrue(result.success);
        assertTrue(result.amountOut > 0);
        assertTrue(result.executionId != bytes32(0));
    }

    function test_Execute_TakesProtocolFee() public {
        // Disable test mode to test actual fee transfers
        adapter.setTestMode(false);
        
        // Skip this test since it requires PoolSwapTest to be set
        // Fee collection is tested in YellowExecutorV4Test with real Uniswap V4
        vm.skip(true);
    }

    function test_RevertWhen_Execute_NotAuthorized() public {
        IYellowExecutorAdapter.ExecutionRequest memory request = IYellowExecutorAdapter.ExecutionRequest({
            agentId: 1,
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 10 ether,
            minAmountOut: 9 ether,
            routeData: ""
        });

        vm.prank(user);
        vm.expectRevert("Not authorized");
        adapter.execute(request);
    }

    function test_RevertWhen_Execute_ZeroAmount() public {
        IYellowExecutorAdapter.ExecutionRequest memory request = IYellowExecutorAdapter.ExecutionRequest({
            agentId: 1,
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 0,
            minAmountOut: 0,
            routeData: ""
        });

        vm.prank(authorizedCaller);
        vm.expectRevert("Amount must be > 0");
        adapter.execute(request);
    }

    function test_RevertWhen_Execute_SameToken() public {
        IYellowExecutorAdapter.ExecutionRequest memory request = IYellowExecutorAdapter.ExecutionRequest({
            agentId: 1,
            tokenIn: address(tokenIn),
            tokenOut: address(tokenIn), // Same token
            amountIn: 10 ether,
            minAmountOut: 9 ether,
            routeData: ""
        });

        vm.prank(authorizedCaller);
        vm.expectRevert("Same token");
        adapter.execute(request);
    }

    // ============ Estimation Tests ============

    function test_EstimateExecution() public view {
        IYellowExecutorAdapter.ExecutionRequest memory request = IYellowExecutorAdapter.ExecutionRequest({
            agentId: 1,
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: 100 ether,
            minAmountOut: 0,
            routeData: ""
        });

        uint256 estimated = adapter.estimateExecution(request);

        // Should account for protocol fee (0.1%) and swap fee (0.3%)
        assertTrue(estimated > 0);
        assertTrue(estimated < 100 ether);
    }

    // ============ Admin Tests ============

    function test_SetAuthorizedCaller() public {
        address newCaller = address(0x5);

        adapter.setAuthorizedCaller(newCaller, true);
        assertTrue(adapter.authorizedCallers(newCaller));

        adapter.setAuthorizedCaller(newCaller, false);
        assertFalse(adapter.authorizedCallers(newCaller));
    }

    function test_SetProtocolFee() public {
        uint256 newFee = 50; // 0.5%

        adapter.setProtocolFee(newFee);
        assertEq(adapter.protocolFeeBps(), newFee);
    }

    function test_RevertWhen_SetProtocolFee_TooHigh() public {
        vm.expectRevert("Fee too high");
        adapter.setProtocolFee(101); // > 1%
    }

    function test_SetFeeRecipient() public {
        address newRecipient = address(0x6);

        adapter.setFeeRecipient(newRecipient);
        assertEq(adapter.feeRecipient(), newRecipient);
    }

    function test_SetYellowRouter() public {
        address newRouter = address(0x7);

        adapter.setYellowRouter(newRouter);
        assertEq(adapter.yellowRouter(), newRouter);
    }

    function test_RevertWhen_SetYellowRouter_ZeroAddress() public {
        vm.expectRevert("Invalid router");
        adapter.setYellowRouter(address(0));
    }

    function test_RescueTokens() public {
        uint256 stuckAmount = 5 ether;
        tokenIn.mint(address(adapter), stuckAmount);

        uint256 ownerBalanceBefore = tokenIn.balanceOf(owner);
        adapter.rescueTokens(address(tokenIn), stuckAmount);
        uint256 ownerBalanceAfter = tokenIn.balanceOf(owner);

        assertEq(ownerBalanceAfter - ownerBalanceBefore, stuckAmount);
    }

    // ============ Execution Result Tests ============

    function test_GetExecution() public {
        uint256 amountIn = 10 ether;

        IYellowExecutorAdapter.ExecutionRequest memory request = IYellowExecutorAdapter.ExecutionRequest({
            agentId: 1,
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: amountIn,
            minAmountOut: 9 ether,
            routeData: ""
        });

        tokenIn.mint(authorizedCaller, amountIn);

        vm.startPrank(authorizedCaller);
        tokenIn.approve(address(adapter), amountIn);
        IYellowExecutorAdapter.ExecutionResult memory result = adapter.execute(request);
        vm.stopPrank();

        IYellowExecutorAdapter.ExecutionResult memory stored = adapter.getExecution(result.executionId);

        assertEq(stored.executionId, result.executionId);
        assertEq(stored.amountIn, result.amountIn);
        assertEq(stored.amountOut, result.amountOut);
        assertTrue(stored.success);
    }
}
