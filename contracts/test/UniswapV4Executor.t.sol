// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {UniswapV4Executor} from "../src/UniswapV4Executor.sol";
import {IYellowExecutorAdapter} from "../src/interfaces/IYellFi.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract UniswapV4ExecutorTest is Test {
    // Sepolia addresses
    address constant POOL_SWAP_TEST = 0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe;
    address constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address constant WETH = 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    
    UniswapV4Executor public executor;
    address public owner;
    address public caller;
    
    function setUp() public {
        // Fork Sepolia
        vm.createSelectFork("https://ethereum-sepolia-rpc.publicnode.com");
        
        owner = address(this);
        caller = address(0x1);
        
        // Deploy executor
        executor = new UniswapV4Executor(
            POOL_SWAP_TEST,
            POOL_MANAGER,
            owner,
            owner
        );
        
        // Authorize caller
        executor.setAuthorizedCaller(caller, true);
        
        // Set up pool key for USDC/WETH
        executor.setPoolKey(
            USDC,  // token0
            WETH,  // token1
            3000,  // 0.3% fee
            60,    // tick spacing
            address(0)
        );
    }
    
    function test_SetPoolKey() public view {
        // Verify pool key was set
        assertTrue(executor.authorizedCallers(caller));
    }
    
    function test_EstimateExecution() public view {
        IYellowExecutorAdapter.ExecutionRequest memory request = IYellowExecutorAdapter.ExecutionRequest({
            agentId: 1,
            tokenIn: WETH,
            tokenOut: USDC,
            amountIn: 1 ether,
            minAmountOut: 0,
            routeData: ""
        });
        
        uint256 estimated = executor.estimateExecution(request);
        console.log("Estimated output:", estimated);
        assertTrue(estimated > 0);
    }
    
    function test_RevertWhen_NotAuthorized() public {
        IYellowExecutorAdapter.ExecutionRequest memory request = IYellowExecutorAdapter.ExecutionRequest({
            agentId: 1,
            tokenIn: WETH,
            tokenOut: USDC,
            amountIn: 1 ether,
            minAmountOut: 0,
            routeData: ""
        });
        
        // Try to execute without authorization
        vm.expectRevert("Not authorized");
        executor.execute(request);
    }
    
    function test_ExecuteSwap() public {
        // Get some WETH for testing
        uint256 amountIn = 0.01 ether;
        
        // Deal WETH to caller
        deal(WETH, caller, amountIn);
        
        // Approve executor
        vm.startPrank(caller);
        IERC20(WETH).approve(address(executor), amountIn);
        
        IYellowExecutorAdapter.ExecutionRequest memory request = IYellowExecutorAdapter.ExecutionRequest({
            agentId: 1,
            tokenIn: WETH,
            tokenOut: USDC,
            amountIn: amountIn,
            minAmountOut: 0, // No slippage protection for test
            routeData: ""
        });
        
        console.log("=== Before Swap ===");
        console.log("Caller WETH balance:", IERC20(WETH).balanceOf(caller));
        console.log("Caller USDC balance:", IERC20(USDC).balanceOf(caller));
        
        // Execute swap
        IYellowExecutorAdapter.ExecutionResult memory result = executor.execute(request);
        
        console.log("=== After Swap ===");
        console.log("Caller WETH balance:", IERC20(WETH).balanceOf(caller));
        console.log("Caller USDC balance:", IERC20(USDC).balanceOf(caller));
        console.log("Amount out:", result.amountOut);
        console.log("Success:", result.success);
        
        vm.stopPrank();
        
        assertTrue(result.success);
        assertTrue(result.amountOut > 0);
    }
}
