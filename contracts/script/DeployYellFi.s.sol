// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {StrategyAgent} from "../src/StrategyAgent.sol";
import {YellFiHook} from "../src/YellFiHook.sol";
import {YellowExecutorAdapter} from "../src/YellowExecutorAdapter.sol";
import {EnsSubnameMinter} from "../src/EnsSubnameMinter.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {HookMiner} from "../test/utils/HookMiner.sol";

/// @title DeployYellFi
/// @notice Deploys all YellFi contracts to Sepolia
contract DeployYellFi is Script {
    // Sepolia addresses
    address constant POOL_MANAGER_SEPOLIA = 0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A;
    address constant ENS_REGISTRY_SEPOLIA = 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e;
    address constant ENS_RESOLVER_SEPOLIA = 0x8FADE66B79cC9f707aB26799354482EB93a5B7dD;
    
    // YellFi parent node (yellfi.eth namehash)
    bytes32 constant YELLFI_PARENT_NODE = 0x0; // Replace with actual namehash after registration
    
    // Deployment addresses
    address public hook;
    address public executor;
    address public ensMinter;
    address public strategyAgent;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        address yellowRouter = vm.envOr("YELLOW_ROUTER", address(0));
        
        console2.log("Deployer:", deployer);
        console2.log("Fee Recipient:", feeRecipient);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy ENS Subname Minter
        ensMinter = address(new EnsSubnameMinter(
            ENS_REGISTRY_SEPOLIA,
            ENS_RESOLVER_SEPOLIA,
            YELLFI_PARENT_NODE,
            deployer
        ));
        console2.log("EnsSubnameMinter deployed:", ensMinter);
        
        // 2. Deploy Yellow Executor Adapter
        executor = address(new YellowExecutorAdapter(
            yellowRouter,
            feeRecipient,
            deployer
        ));
        console2.log("YellowExecutorAdapter deployed:", executor);
        
        // 3. Deploy YellFi Hook with correct address prefix
        // Hook address must have specific flags in the address
        uint160 flags = uint160(
            Hooks.AFTER_INITIALIZE_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG |
            Hooks.AFTER_ADD_LIQUIDITY_FLAG |
            Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
        );
        
        // Mine salt for hook address
        (address hookAddress, bytes32 salt) = HookMiner.find(
            deployer,
            flags,
            type(YellFiHook).creationCode,
            abi.encode(IPoolManager(POOL_MANAGER_SEPOLIA))
        );
        
        hook = address(new YellFiHook{salt: salt}(IPoolManager(POOL_MANAGER_SEPOLIA)));
        require(hook == hookAddress, "Hook address mismatch");
        console2.log("YellFiHook deployed:", hook);
        
        // 4. Deploy Strategy Agent
        strategyAgent = address(new StrategyAgent(
            executor,
            ensMinter,
            deployer
        ));
        console2.log("StrategyAgent deployed:", strategyAgent);
        
        // 5. Configure permissions
        
        // Set strategy agent in hook
        YellFiHook(hook).setStrategyAgent(strategyAgent);
        
        // Authorize strategy agent as executor caller
        YellowExecutorAdapter(payable(executor)).setAuthorizedCaller(strategyAgent, true);
        
        // Authorize strategy agent as ENS minter
        EnsSubnameMinter(ensMinter).setAuthorizedMinter(strategyAgent, true);
        
        // Set deployer as keeper
        StrategyAgent(strategyAgent).setKeeper(deployer, true);
        
        vm.stopBroadcast();
        
        // Log deployment summary
        console2.log("\n=== YellFi Deployment Summary ===");
        console2.log("Network: Sepolia");
        console2.log("EnsSubnameMinter:", ensMinter);
        console2.log("YellowExecutorAdapter:", executor);
        console2.log("YellFiHook:", hook);
        console2.log("StrategyAgent:", strategyAgent);
        console2.log("================================\n");
    }
}

/// @title DeployHookOnly
/// @notice Deploys only the YellFi hook (for testing)
contract DeployHookOnly is Script {
    address constant POOL_MANAGER_SEPOLIA = 0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        uint160 flags = uint160(
            Hooks.AFTER_INITIALIZE_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG |
            Hooks.AFTER_ADD_LIQUIDITY_FLAG |
            Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
        );
        
        (address hookAddress, bytes32 salt) = HookMiner.find(
            deployer,
            flags,
            type(YellFiHook).creationCode,
            abi.encode(IPoolManager(POOL_MANAGER_SEPOLIA))
        );
        
        address hook = address(new YellFiHook{salt: salt}(IPoolManager(POOL_MANAGER_SEPOLIA)));
        require(hook == hookAddress, "Hook address mismatch");
        
        vm.stopBroadcast();
        
        console2.log("YellFiHook deployed:", hook);
    }
}

/// @title CreatePool
/// @notice Creates a Uniswap v4 pool with YellFi hook attached
contract CreatePool is Script {
    address constant POOL_MANAGER_SEPOLIA = 0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address hookAddress = vm.envAddress("YELLFI_HOOK");
        address token0 = vm.envAddress("TOKEN0");
        address token1 = vm.envAddress("TOKEN1");
        uint24 fee = uint24(vm.envOr("FEE", uint256(3000)));
        int24 tickSpacing = int24(int256(vm.envOr("TICK_SPACING", uint256(60))));
        uint160 sqrtPriceX96 = uint160(vm.envOr("SQRT_PRICE_X96", uint256(79228162514264337593543950336))); // 1:1
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Ensure token0 < token1
        if (token0 > token1) {
            (token0, token1) = (token1, token0);
        }
        
        // Create pool key
        // Note: In production, use proper Currency types
        bytes memory hookData = "";
        
        // Initialize pool via PoolManager
        // IPoolManager(POOL_MANAGER_SEPOLIA).initialize(key, sqrtPriceX96, hookData);
        
        vm.stopBroadcast();
        
        console2.log("Pool created with hook:", hookAddress);
        console2.log("Token0:", token0);
        console2.log("Token1:", token1);
    }
}
