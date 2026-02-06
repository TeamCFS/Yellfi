// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EnsSubnameMinter} from "../src/EnsSubnameMinter.sol";

contract RedeployEnsMinterScript is Script {
    // ENS addresses on Sepolia
    address constant ENS_REGISTRY = 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e;
    address constant ENS_RESOLVER = 0x8FADE66B79cC9f707aB26799354482EB93a5B7dD;
    
    // New StrategyAgent
    address constant STRATEGY_AGENT = 0x592D625Aa81292C5225c073dEbaB461AcEb9ac94;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deployer:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy new EnsSubnameMinter with parentNode = 0 (test mode)
        EnsSubnameMinter newMinter = new EnsSubnameMinter(
            ENS_REGISTRY,
            ENS_RESOLVER,
            bytes32(0), // parentNode = 0 for test mode (skips ENS registry calls)
            deployer
        );
        
        console.log("New EnsSubnameMinter:", address(newMinter));
        
        // Authorize StrategyAgent
        newMinter.setAuthorizedMinter(STRATEGY_AGENT, true);
        console.log("StrategyAgent authorized");
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("IMPORTANT: The StrategyAgent has immutable ensMinter address.");
        console.log("You need to redeploy StrategyAgent with the new EnsSubnameMinter.");
    }
}
