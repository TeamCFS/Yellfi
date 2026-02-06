// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {UniswapV4Executor} from "../src/UniswapV4Executor.sol";
import {StrategyAgent} from "../src/StrategyAgent.sol";
import {EnsSubnameMinter} from "../src/EnsSubnameMinter.sol";

contract DeployV4Executor is Script {
    // Sepolia Uniswap V4 addresses
    address constant POOL_SWAP_TEST = 0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe;
    address constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    
    // Sepolia token addresses
    address constant WETH = 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9;
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    
    // Existing ENS Minter (reuse)
    address constant ENS_MINTER = 0x0a01cC2615fEc45845B08bD4A948eFDB45F23d32;
    
    // Keeper address
    address constant KEEPER = 0x68b642Cd2EA314860e796F6d0153d70442085859;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("=== Deploying UniswapV4 Integration ===");
        console.log("Deployer:", deployer);
        console.log("PoolSwapTest:", POOL_SWAP_TEST);
        console.log("PoolManager:", POOL_MANAGER);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy UniswapV4Executor
        UniswapV4Executor executor = new UniswapV4Executor(
            POOL_SWAP_TEST,
            POOL_MANAGER,
            deployer, // fee recipient
            deployer  // owner
        );
        console.log("UniswapV4Executor deployed at:", address(executor));
        
        // 2. Deploy new StrategyAgent with V4 executor
        StrategyAgent agent = new StrategyAgent(
            address(executor),
            ENS_MINTER,
            deployer
        );
        console.log("StrategyAgent deployed at:", address(agent));
        
        // 3. Authorize StrategyAgent to call executor
        executor.setAuthorizedCaller(address(agent), true);
        console.log("Authorized StrategyAgent on executor");
        
        // 4. Set keeper on StrategyAgent
        agent.setKeeper(KEEPER, true);
        console.log("Set keeper:", KEEPER);
        
        // 5. Authorize StrategyAgent on ENS Minter
        EnsSubnameMinter minter = EnsSubnameMinter(ENS_MINTER);
        minter.setAuthorizedMinter(address(agent), true);
        console.log("Authorized StrategyAgent on ENS Minter");
        
        // 6. Set up WETH/USDC pool key
        // Note: USDC < WETH in address ordering
        executor.setPoolKey(
            USDC,  // token0 (lower address)
            WETH,  // token1 (higher address)
            3000,  // 0.3% fee
            60,    // tick spacing
            address(0) // no hooks
        );
        console.log("Set USDC/WETH pool key (0.3% fee)");
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("UniswapV4Executor:", address(executor));
        console.log("StrategyAgent:", address(agent));
        console.log("");
        console.log("Update configs with these addresses!");
    }
}
