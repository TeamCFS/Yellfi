// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {YellowExecutorAdapter} from "../src/YellowExecutorAdapter.sol";
import {StrategyAgent} from "../src/StrategyAgent.sol";
import {EnsSubnameMinter} from "../src/EnsSubnameMinter.sol";

contract RedeployAllScript is Script {
    // ENS addresses on Sepolia
    address constant ENS_REGISTRY = 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e;
    address constant ENS_RESOLVER = 0x8FADE66B79cC9f707aB26799354482EB93a5B7dD;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deployer:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy new EnsSubnameMinter (fresh state)
        EnsSubnameMinter newMinter = new EnsSubnameMinter(
            ENS_REGISTRY,
            ENS_RESOLVER,
            bytes32(0), // parentNode = 0 for test mode
            deployer
        );
        console.log("New EnsSubnameMinter:", address(newMinter));
        
        // 2. Deploy new YellowExecutorAdapter with test mode
        YellowExecutorAdapter newExecutor = new YellowExecutorAdapter(
            address(0), // No yellow router for testnet
            deployer,   // Fee recipient
            deployer    // Owner
        );
        console.log("New YellowExecutorAdapter:", address(newExecutor));
        console.log("  Test mode enabled:", newExecutor.testMode());
        
        // 3. Deploy new StrategyAgent with new executor and minter
        StrategyAgent newAgent = new StrategyAgent(
            address(newExecutor),
            address(newMinter),
            deployer
        );
        console.log("New StrategyAgent:", address(newAgent));
        
        // 4. Authorize StrategyAgent on executor
        newExecutor.setAuthorizedCaller(address(newAgent), true);
        console.log("StrategyAgent authorized on executor");
        
        // 5. Authorize StrategyAgent on minter
        newMinter.setAuthorizedMinter(address(newAgent), true);
        console.log("StrategyAgent authorized on minter");
        
        // 6. Add deployer as keeper
        newAgent.setKeeper(deployer, true);
        console.log("Deployer added as keeper");
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("=== DEPLOYMENT COMPLETE ===");
        console.log("EnsSubnameMinter:", address(newMinter));
        console.log("YellowExecutorAdapter:", address(newExecutor));
        console.log("StrategyAgent:", address(newAgent));
        console.log("");
        console.log("Update these addresses in:");
        console.log("  - frontend/src/config/contracts.ts");
        console.log("  - backend/src/config.ts");
        console.log("  - backend/.env.example");
    }
}
