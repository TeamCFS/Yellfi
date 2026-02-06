// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {StrategyAgent} from "../src/StrategyAgent.sol";
import {YellowExecutorAdapter} from "../src/YellowExecutorAdapter.sol";
import {EnsSubnameMinter} from "../src/EnsSubnameMinter.sol";
import {IYellowExecutorAdapter} from "../src/interfaces/IYellFi.sol";
import {IStrategyAgent} from "../src/interfaces/IYellFi.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ExecuteDebugTest is Test {
    StrategyAgent public agent;
    YellowExecutorAdapter public executor;
    EnsSubnameMinter public minter;
    
    address constant WETH = 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address constant KEEPER = 0x68b642Cd2EA314860e796F6d0153d70442085859;
    
    function setUp() public {
        // Fork Sepolia
        vm.createSelectFork("https://ethereum-sepolia-rpc.publicnode.com");
        
        // Use deployed contracts
        agent = StrategyAgent(0x34935A9B0E95930aB5dEA413443dBE06aD4E7DD1);
        executor = YellowExecutorAdapter(payable(0xA388634dbDD0BF6116d3249886F0DD987c0BDa05));
    }
    
    function testDecodeExecutionData() public view {
        bytes memory executionData = hex"00000000000000000000000000000000000000000000000000000000000000010000000000000000000000007b79995e5f793a07bc00c21412e50ecae098e7f90000000000000000000000001c7d4b196cb0c7b01d743fbc6116a902379c72380000000000000000000000000000000000000000000000000003e871b540c0000000000000000000000000000000000000000000000000000003de709229100000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000000";
        
        IYellowExecutorAdapter.ExecutionRequest memory request = abi.decode(
            executionData,
            (IYellowExecutorAdapter.ExecutionRequest)
        );
        
        console.log("Decoded agentId:", request.agentId);
        console.log("Decoded tokenIn:", request.tokenIn);
        console.log("Decoded tokenOut:", request.tokenOut);
        console.log("Decoded amountIn:", request.amountIn);
        console.log("Decoded minAmountOut:", request.minAmountOut);
        console.log("Decoded routeData length:", request.routeData.length);
    }
    
    function testExecuteWithTrace() public {
        // Check pre-conditions
        console.log("=== PRE-CONDITIONS ===");
        
        bool canExec = agent.canExecute(1, 0);
        console.log("canExecute:", canExec);
        
        IStrategyAgent.AgentConfig memory agentConfig = agent.getAgent(1);
        console.log("Agent owner:", agentConfig.owner);
        console.log("Agent status:", uint8(agentConfig.status));
        console.log("Agent deposited:", agentConfig.depositedAmount);
        
        uint256 wethBalance = agent.getAgentBalance(1, WETH);
        console.log("WETH balance:", wethBalance);
        
        bool isKeeper = agent.keepers(KEEPER);
        console.log("Is keeper:", isKeeper);
        
        // Build execution data
        bytes memory executionData = abi.encode(
            IYellowExecutorAdapter.ExecutionRequest({
                agentId: 1,
                tokenIn: WETH,
                tokenOut: USDC,
                amountIn: 1100000000000000, // 0.0011 WETH
                minAmountOut: 1089000000000000, // 0.001089
                routeData: ""
            })
        );
        
        console.log("=== EXECUTING ===");
        
        // Execute as keeper
        vm.prank(KEEPER);
        agent.execute(1, 0, executionData);
        
        console.log("=== SUCCESS ===");
    }
    
    function testForceApprove() public {
        // Test if forceApprove works on WETH
        vm.prank(address(agent));
        IERC20(WETH).approve(address(executor), 1000000000000000);
        
        uint256 allowance = IERC20(WETH).allowance(address(agent), address(executor));
        console.log("Allowance after approve:", allowance);
    }
}
