// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IEnsSubnameMinter} from "./interfaces/IYellFi.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice ENS Registry interface (simplified)
interface IENS {
    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner,
        address resolver,
        uint64 ttl
    ) external;
    function owner(bytes32 node) external view returns (address);
    function resolver(bytes32 node) external view returns (address);
}

/// @notice ENS Resolver interface (simplified)
interface IResolver {
    function setAddr(bytes32 node, address addr) external;
    function setText(bytes32 node, string calldata key, string calldata value) external;
}

/// @title EnsSubnameMinter
/// @notice Manages ENS subnames for YellFi strategy agents
/// @dev Creates subnames under yellfi.eth (e.g., myagent.yellfi.eth)
contract EnsSubnameMinter is IEnsSubnameMinter, Ownable {

    // ENS contracts (Sepolia addresses)
    IENS public immutable ensRegistry;
    address public resolver;
    
    // Parent node: yellfi.eth
    bytes32 public immutable parentNode;
    string public constant PARENT_NAME = "yellfi.eth";
    
    // Subname mappings
    mapping(bytes32 => uint256) private _nodeToAgent;
    mapping(uint256 => bytes32) private _agentToNode;
    mapping(uint256 => string) private _agentToName;
    mapping(string => bool) private _registeredLabels;
    
    // Authorized minters (strategy agent contracts)
    mapping(address => bool) public authorizedMinters;
    
    // Name validation
    uint256 public constant MIN_LABEL_LENGTH = 3;
    uint256 public constant MAX_LABEL_LENGTH = 32;

    event MinterAuthorized(address indexed minter, bool authorized);
    event ResolverUpdated(address indexed oldResolver, address indexed newResolver);

    modifier onlyAuthorizedMinter() {
        require(authorizedMinters[msg.sender], "Not authorized minter");
        _;
    }

    constructor(
        address _ensRegistry,
        address _resolver,
        bytes32 _parentNode,
        address _owner
    ) Ownable(_owner) {
        ensRegistry = IENS(_ensRegistry);
        resolver = _resolver;
        parentNode = _parentNode;
    }

    /// @notice Register a subname for a strategy agent
    /// @param label The subname label (e.g., "myagent" for myagent.yellfi.eth)
    /// @param owner The owner address for the subname
    /// @param agentId The strategy agent ID
    /// @return node The ENS node hash
    function registerSubname(
        string calldata label,
        address owner,
        uint256 agentId
    ) external override onlyAuthorizedMinter returns (bytes32 node) {
        require(_validateLabel(label), "Invalid label");
        require(!_registeredLabels[label], "Label already registered");
        require(_agentToNode[agentId] == bytes32(0), "Agent already has name");
        
        bytes32 labelHash = keccak256(bytes(label));
        node = keccak256(abi.encodePacked(parentNode, labelHash));
        
        // Register subnode in ENS (skip if parentNode is 0x0 - test mode)
        if (parentNode != bytes32(0)) {
            ensRegistry.setSubnodeRecord(
                parentNode,
                labelHash,
                owner,
                resolver,
                0 // TTL
            );
            
            // Set resolver records
            if (resolver != address(0)) {
                IResolver(resolver).setAddr(node, owner);
                IResolver(resolver).setText(node, "agentId", _uint256ToString(agentId));
            }
        }
        
        // Store mappings
        _nodeToAgent[node] = agentId;
        _agentToNode[agentId] = node;
        _agentToName[agentId] = string(abi.encodePacked(label, ".", PARENT_NAME));
        _registeredLabels[label] = true;
        
        emit SubnameRegistered(parentNode, labelHash, owner, _agentToName[agentId]);
    }

    /// @notice Get agent ID by full ENS name
    /// @param fullName The full ENS name (e.g., "myagent.yellfi.eth")
    /// @return agentId The strategy agent ID
    function getAgentByName(
        string calldata fullName
    ) external view override returns (uint256 agentId) {
        bytes32 node = _namehash(fullName);
        return _nodeToAgent[node];
    }

    /// @notice Get ENS name by agent ID
    /// @param agentId The strategy agent ID
    /// @return The full ENS name
    function getNameByAgent(
        uint256 agentId
    ) external view override returns (string memory) {
        return _agentToName[agentId];
    }

    /// @notice Check if a label is available
    /// @param label The subname label to check
    /// @return True if available
    function isNameAvailable(
        string calldata label
    ) external view override returns (bool) {
        if (!_validateLabel(label)) return false;
        return !_registeredLabels[label];
    }

    /// @notice Get node hash for an agent
    function getNodeByAgent(uint256 agentId) external view returns (bytes32) {
        return _agentToNode[agentId];
    }

    /// @notice Get agent by node hash
    function getAgentByNode(bytes32 node) external view returns (uint256) {
        return _nodeToAgent[node];
    }

    // Admin functions

    /// @notice Authorize or deauthorize a minter
    function setAuthorizedMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
        emit MinterAuthorized(minter, authorized);
    }

    /// @notice Update resolver address
    function setResolver(address _resolver) external onlyOwner {
        address oldResolver = resolver;
        resolver = _resolver;
        emit ResolverUpdated(oldResolver, _resolver);
    }

    // Internal functions

    /// @notice Validate label format
    function _validateLabel(string calldata label) internal pure returns (bool) {
        bytes memory labelBytes = bytes(label);
        uint256 length = labelBytes.length;
        
        if (length < MIN_LABEL_LENGTH || length > MAX_LABEL_LENGTH) {
            return false;
        }
        
        // Check for valid characters (lowercase alphanumeric and hyphens)
        for (uint256 i = 0; i < length; i++) {
            bytes1 char = labelBytes[i];
            bool isLowercase = (char >= 0x61 && char <= 0x7A); // a-z
            bool isDigit = (char >= 0x30 && char <= 0x39);     // 0-9
            bool isHyphen = (char == 0x2D);                     // -
            
            if (!isLowercase && !isDigit && !isHyphen) {
                return false;
            }
            
            // No leading or trailing hyphens
            if (isHyphen && (i == 0 || i == length - 1)) {
                return false;
            }
        }
        
        return true;
    }

    /// @notice Compute namehash for a full ENS name
    function _namehash(string memory name) internal pure returns (bytes32) {
        bytes32 node = bytes32(0);
        
        if (bytes(name).length == 0) {
            return node;
        }
        
        // Split by dots and hash from right to left
        bytes memory nameBytes = bytes(name);
        uint256 lastDot = nameBytes.length;
        
        for (uint256 i = nameBytes.length; i > 0; i--) {
            if (nameBytes[i - 1] == 0x2E || i == 1) { // '.' or start
                uint256 start = (nameBytes[i - 1] == 0x2E) ? i : i - 1;
                uint256 labelLength = lastDot - start;
                
                if (labelLength > 0) {
                    bytes memory label = new bytes(labelLength);
                    for (uint256 j = 0; j < labelLength; j++) {
                        label[j] = nameBytes[start + j];
                    }
                    node = keccak256(abi.encodePacked(node, keccak256(label)));
                }
                
                lastDot = start - 1;
            }
        }
        
        return node;
    }

    /// @notice Convert uint256 to string
    function _uint256ToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        
        uint256 temp = value;
        uint256 digits;
        
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        
        bytes memory buffer = new bytes(digits);
        
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        
        return string(buffer);
    }
}
