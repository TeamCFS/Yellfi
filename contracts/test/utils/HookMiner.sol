// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title HookMiner
/// @notice Mines salt values to deploy hooks at addresses with required flag bits
library HookMiner {
    /// @notice Find a salt that produces a hook address with the required flags
    /// @param deployer The address that will deploy the hook
    /// @param flags The required flag bits in the hook address
    /// @param creationCode The creation code of the hook contract
    /// @param constructorArgs The encoded constructor arguments
    /// @return hookAddress The address where the hook will be deployed
    /// @return salt The salt to use for CREATE2 deployment
    function find(
        address deployer,
        uint160 flags,
        bytes memory creationCode,
        bytes memory constructorArgs
    ) internal pure returns (address hookAddress, bytes32 salt) {
        bytes memory initCode = abi.encodePacked(creationCode, constructorArgs);
        bytes32 initCodeHash = keccak256(initCode);
        
        uint256 saltCounter = 0;
        
        while (true) {
            salt = bytes32(saltCounter);
            hookAddress = computeAddress(deployer, salt, initCodeHash);
            
            if (hasRequiredFlags(hookAddress, flags)) {
                return (hookAddress, salt);
            }
            
            saltCounter++;
            
            // Safety limit
            require(saltCounter < 1_000_000, "Could not find valid salt");
        }
    }

    /// @notice Compute CREATE2 address
    function computeAddress(
        address deployer,
        bytes32 salt,
        bytes32 initCodeHash
    ) internal pure returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            deployer,
                            salt,
                            initCodeHash
                        )
                    )
                )
            )
        );
    }

    /// @notice Check if address has required flag bits set
    function hasRequiredFlags(
        address hookAddress,
        uint160 flags
    ) internal pure returns (bool) {
        uint160 addressBits = uint160(hookAddress);
        return (addressBits & flags) == flags;
    }
}
