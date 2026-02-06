// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EnsSubnameMinter} from "../src/EnsSubnameMinter.sol";

contract AuthorizeMinterScript is Script {
    address constant ENS_MINTER = 0x73D78816ea4C9d7479475805aFb449E611EF4703;
    address constant NEW_STRATEGY_AGENT = 0x592D625Aa81292C5225c073dEbaB461AcEb9ac94;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        EnsSubnameMinter minter = EnsSubnameMinter(ENS_MINTER);
        
        console.log("EnsSubnameMinter:", ENS_MINTER);
        console.log("New StrategyAgent:", NEW_STRATEGY_AGENT);
        
        bool isAuthorized = minter.authorizedMinters(NEW_STRATEGY_AGENT);
        console.log("Current authorization:", isAuthorized);
        
        if (!isAuthorized) {
            minter.setAuthorizedMinter(NEW_STRATEGY_AGENT, true);
            console.log("New StrategyAgent authorized successfully");
        } else {
            console.log("Already authorized");
        }
        
        vm.stopBroadcast();
    }
}
