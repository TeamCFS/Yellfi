// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {YellowExecutorAdapter} from "../src/YellowExecutorAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SetupExecutorScript is Script {
    // Deployed addresses on Sepolia
    address constant STRATEGY_AGENT = 0x1E1c3ac46e77e695e7d5A04FaaD04C66Bd659947;
    address constant EXECUTOR_ADAPTER = 0x6aF9e2d880cbB65f5e37Bd951BdA146e6D893f42;
    
    // Token addresses on Sepolia
    address constant WETH = 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        YellowExecutorAdapter executor = YellowExecutorAdapter(payable(EXECUTOR_ADAPTER));
        
        console.log("ExecutorAdapter:", EXECUTOR_ADAPTER);
        console.log("StrategyAgent:", STRATEGY_AGENT);
        
        // 1. Authorize StrategyAgent to call ExecutorAdapter
        bool isAuthorized = executor.authorizedCallers(STRATEGY_AGENT);
        console.log("Current authorization:", isAuthorized);
        
        if (!isAuthorized) {
            executor.setAuthorizedCaller(STRATEGY_AGENT, true);
            console.log("StrategyAgent authorized successfully");
        } else {
            console.log("StrategyAgent already authorized");
        }
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("NOTE: The ExecutorAdapter also needs token balances for simulated swaps.");
        console.log("Send some WETH and USDC to:", EXECUTOR_ADAPTER);
    }
}
