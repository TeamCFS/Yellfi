// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {StrategyAgent} from "../src/StrategyAgent.sol";

contract AddKeeperScript is Script {
    // Deployed StrategyAgent address on Sepolia
    address constant STRATEGY_AGENT = 0x1E1c3ac46e77e695e7d5A04FaaD04C66Bd659947;
    
    function run() external {
        // Get keeper address from environment or use default
        address keeper = vm.envOr("KEEPER_ADDRESS", address(0x68b642Cd2EA314860e796F6d0153d70442085859));
        
        console.log("StrategyAgent:", STRATEGY_AGENT);
        console.log("Adding keeper:", keeper);
        
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        StrategyAgent agent = StrategyAgent(STRATEGY_AGENT);
        
        // Check current status
        bool isKeeper = agent.keepers(keeper);
        console.log("Current keeper status:", isKeeper);
        
        if (!isKeeper) {
            agent.setKeeper(keeper, true);
            console.log("Keeper added successfully");
        } else {
            console.log("Address is already a keeper");
        }
        
        vm.stopBroadcast();
    }
}
