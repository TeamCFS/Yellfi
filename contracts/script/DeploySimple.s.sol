// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {StrategyAgent} from "../src/StrategyAgent.sol";
import {YellowExecutorAdapter} from "../src/YellowExecutorAdapter.sol";
import {EnsSubnameMinter} from "../src/EnsSubnameMinter.sol";

/// @title DeploySimple
/// @notice Deploys YellFi contracts to Sepolia (without hook - requires address mining)
contract DeploySimple is Script {
    // Sepolia addresses
    address constant ENS_REGISTRY_SEPOLIA = 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e;
    address constant ENS_RESOLVER_SEPOLIA = 0x8FADE66B79cC9f707aB26799354482EB93a5B7dD;
    
    // YellFi parent node (placeholder - would be actual yellfi.eth namehash)
    bytes32 constant YELLFI_PARENT_NODE = bytes32(0);

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console2.log("Deployer:", deployer);
        console2.log("Balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy ENS Subname Minter
        EnsSubnameMinter ensMinter = new EnsSubnameMinter(
            ENS_REGISTRY_SEPOLIA,
            ENS_RESOLVER_SEPOLIA,
            YELLFI_PARENT_NODE,
            deployer
        );
        console2.log("EnsSubnameMinter deployed:", address(ensMinter));
        
        // 2. Deploy Yellow Executor Adapter
        YellowExecutorAdapter executor = new YellowExecutorAdapter(
            address(0), // Yellow router placeholder
            deployer,   // Fee recipient
            deployer    // Owner
        );
        console2.log("YellowExecutorAdapter deployed:", address(executor));
        
        // 3. Deploy Strategy Agent
        StrategyAgent strategyAgent = new StrategyAgent(
            address(executor),
            address(ensMinter),
            deployer
        );
        console2.log("StrategyAgent deployed:", address(strategyAgent));
        
        // 4. Configure permissions
        executor.setAuthorizedCaller(address(strategyAgent), true);
        ensMinter.setAuthorizedMinter(address(strategyAgent), true);
        strategyAgent.setKeeper(deployer, true);
        
        vm.stopBroadcast();
        
        // Log deployment summary
        console2.log("\n=== YellFi Deployment Summary ===");
        console2.log("Network: Sepolia");
        console2.log("EnsSubnameMinter:", address(ensMinter));
        console2.log("YellowExecutorAdapter:", address(executor));
        console2.log("StrategyAgent:", address(strategyAgent));
        console2.log("================================\n");
    }
}
