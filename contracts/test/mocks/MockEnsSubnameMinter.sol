// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IEnsSubnameMinter} from "../../src/interfaces/IYellFi.sol";

contract MockEnsSubnameMinter is IEnsSubnameMinter {
    mapping(string => uint256) private _labelToAgent;
    mapping(uint256 => string) private _agentToName;
    mapping(string => bool) private _registeredLabels;

    function registerSubname(
        string calldata label,
        address owner,
        uint256 agentId
    ) external override returns (bytes32 node) {
        require(!_registeredLabels[label], "Label already registered");
        
        node = keccak256(abi.encodePacked(label));
        _labelToAgent[label] = agentId;
        _agentToName[agentId] = string(abi.encodePacked(label, ".yellfi.eth"));
        _registeredLabels[label] = true;

        emit SubnameRegistered(bytes32(0), keccak256(bytes(label)), owner, _agentToName[agentId]);
    }

    function getAgentByName(
        string calldata fullName
    ) external view override returns (uint256) {
        // Extract label from fullName (simplified)
        return _labelToAgent[fullName];
    }

    function getNameByAgent(
        uint256 agentId
    ) external view override returns (string memory) {
        return _agentToName[agentId];
    }

    function isNameAvailable(
        string calldata label
    ) external view override returns (bool) {
        return !_registeredLabels[label];
    }
}
