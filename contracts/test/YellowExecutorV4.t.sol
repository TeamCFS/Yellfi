// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {YellowExecutorAdapter} from "../src/YellowExecutorAdapter.sol";
import {IYellowExecutorAdapter} from "../src/interfaces/IYellFi.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title YellowExecutorV4Test
/// @notice Tests YellowExecutorAdapter with real Uniswap V4 swaps on Sepolia fork
contract YellowExecutorV4Test is Test {
    // Sepolia addresses
    address constant POOL_SWAP_TEST = 0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe;
    address constant WETH = 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    
    YellowExecutorAdapter public executor;
    address public owner;
    address public caller;
    
    function setUp() public {
        // Fork Sepolia
        vm.createSelectFork("https://ethereum-sepolia-rpc.publicnode.com");
        
        owner = address(this);
        caller = address(0x1);
        
        // Deploy executor
        executor = new YellowExecutorAdapter(
            address(0), // yellowRouter not used
            owner,      // fee recipient
            owner       // owner
        );
        
        // Configure for Uniswap V4
        executor.setPoolSwapTest(POOL_SWAP_TEST);
        executor.setTestMode(false); // Enable real swaps
        
        // Set up pool key for USDC/WETH
        executor.setPoolKey(
            USDC,      // token0
            WETH,      // token1
            3000,      // 0.3% fee
            60,        // tick spacing
            address(0) // no hooks
        );
        
        // Authorize caller
        executor.setAuthorizedCaller(caller, true);
    }
    
    function test_PoolSwapTestIsSet() public view {
        assertEq(address(executor.poolSwapTest()), POOL_SWAP_TEST);
    }
    
    function test_TestModeDisabled() public view {
        assertFalse(executor.testMode());
    }
    
    function test_ExecuteRealSwap_WETHtoUSDC() public {
        uint256 amountIn = 0.01 ether;
        
        // Deal WETH to caller
        deal(WETH, caller, amountIn);
        
        vm.startPrank(caller);
        
        // Approve executor
        IERC20(WETH).approve(address(executor), amountIn);
        
        IYellowExecutorAdapter.ExecutionRequest memory request = IYellowExecutorAdapter.ExecutionRequest({
            agentId: 1,
            tokenIn: WETH,
            tokenOut: USDC,
            amountIn: amountIn,
            minAmountOut: 0,
            routeData: ""
        });
        
        console.log("=== Before Swap ===");
        console.log("Caller WETH:", IERC20(WETH).balanceOf(caller));
        console.log("Caller USDC:", IERC20(USDC).balanceOf(caller));
        
        // Execute swap
        IYellowExecutorAdapter.ExecutionResult memory result = executor.execute(request);
        
        console.log("=== After Swap ===");
        console.log("Caller WETH:", IERC20(WETH).balanceOf(caller));
        console.log("Caller USDC:", IERC20(USDC).balanceOf(caller));
        console.log("Amount out:", result.amountOut);
        console.log("Success:", result.success);
        
        vm.stopPrank();
        
        assertTrue(result.success, "Swap should succeed");
        assertGt(result.amountOut, 0, "Should receive tokens");
    }
    
    function test_ExecuteRealSwap_USDCtoWETH() public {
        uint256 amountIn = 10_000_000; // 10 USDC (6 decimals)
        
        // Deal USDC to caller
        deal(USDC, caller, amountIn);
        
        vm.startPrank(caller);
        
        // Approve executor
        IERC20(USDC).approve(address(executor), amountIn);
        
        IYellowExecutorAdapter.ExecutionRequest memory request = IYellowExecutorAdapter.ExecutionRequest({
            agentId: 1,
            tokenIn: USDC,
            tokenOut: WETH,
            amountIn: amountIn,
            minAmountOut: 0,
            routeData: ""
        });
        
        console.log("=== Before Swap ===");
        console.log("Caller USDC:", IERC20(USDC).balanceOf(caller));
        console.log("Caller WETH:", IERC20(WETH).balanceOf(caller));
        
        // Execute swap
        IYellowExecutorAdapter.ExecutionResult memory result = executor.execute(request);
        
        console.log("=== After Swap ===");
        console.log("Caller USDC:", IERC20(USDC).balanceOf(caller));
        console.log("Caller WETH:", IERC20(WETH).balanceOf(caller));
        console.log("Amount out:", result.amountOut);
        
        vm.stopPrank();
        
        assertTrue(result.success, "Swap should succeed");
        assertGt(result.amountOut, 0, "Should receive WETH");
    }
    
    function test_RevertWhen_TestModeEnabled() public {
        // Enable test mode
        executor.setTestMode(true);
        
        uint256 amountIn = 0.01 ether;
        deal(WETH, caller, amountIn);
        
        vm.startPrank(caller);
        IERC20(WETH).approve(address(executor), amountIn);
        
        IYellowExecutorAdapter.ExecutionRequest memory request = IYellowExecutorAdapter.ExecutionRequest({
            agentId: 1,
            tokenIn: WETH,
            tokenOut: USDC,
            amountIn: amountIn,
            minAmountOut: 0,
            routeData: ""
        });
        
        // In test mode, it should still work but simulate
        IYellowExecutorAdapter.ExecutionResult memory result = executor.execute(request);
        
        vm.stopPrank();
        
        // Test mode simulates output without real swap
        assertTrue(result.success);
        // In test mode, caller keeps their WETH (no transfer)
        assertEq(IERC20(WETH).balanceOf(caller), amountIn);
    }
}
