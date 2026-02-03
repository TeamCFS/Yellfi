// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {EnsSubnameMinter} from "../src/EnsSubnameMinter.sol";

// Mock ENS Registry
contract MockENSRegistry {
    mapping(bytes32 => address) public owners;
    mapping(bytes32 => address) public resolvers;

    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner,
        address resolver,
        uint64 /* ttl */
    ) external {
        bytes32 subnode = keccak256(abi.encodePacked(node, label));
        owners[subnode] = owner;
        resolvers[subnode] = resolver;
    }

    function owner(bytes32 node) external view returns (address) {
        return owners[node];
    }

    function resolver(bytes32 node) external view returns (address) {
        return resolvers[node];
    }
}

// Mock Resolver
contract MockResolver {
    mapping(bytes32 => address) public addresses;
    mapping(bytes32 => mapping(string => string)) public texts;

    function setAddr(bytes32 node, address addr) external {
        addresses[node] = addr;
    }

    function setText(bytes32 node, string calldata key, string calldata value) external {
        texts[node][key] = value;
    }

    function addr(bytes32 node) external view returns (address) {
        return addresses[node];
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return texts[node][key];
    }
}

contract EnsSubnameMinterTest is Test {
    EnsSubnameMinter public minter;
    MockENSRegistry public registry;
    MockResolver public resolver;

    address public owner = address(this);
    address public authorizedMinter = address(0x1);
    address public user1 = address(0x2);

    bytes32 public constant PARENT_NODE = bytes32(uint256(0x123));

    function setUp() public {
        registry = new MockENSRegistry();
        resolver = new MockResolver();

        minter = new EnsSubnameMinter(
            address(registry),
            address(resolver),
            PARENT_NODE,
            owner
        );

        minter.setAuthorizedMinter(authorizedMinter, true);
    }

    // ============ Registration Tests ============

    function test_RegisterSubname() public {
        vm.prank(authorizedMinter);
        bytes32 node = minter.registerSubname("test-agent", user1, 1);

        assertTrue(node != bytes32(0));
        assertEq(minter.getNameByAgent(1), "test-agent.yellfi.eth");
    }

    function test_RegisterSubname_SetsResolver() public {
        vm.prank(authorizedMinter);
        minter.registerSubname("resolver-test", user1, 1);

        // Check resolver was set
        assertEq(resolver.addr(minter.getNodeByAgent(1)), user1);
    }

    function test_RevertWhen_RegisterSubname_NotAuthorized() public {
        vm.prank(user1);
        vm.expectRevert("Not authorized minter");
        minter.registerSubname("unauthorized", user1, 1);
    }

    function test_RevertWhen_RegisterSubname_AlreadyRegistered() public {
        vm.startPrank(authorizedMinter);
        minter.registerSubname("duplicate", user1, 1);

        vm.expectRevert("Label already registered");
        minter.registerSubname("duplicate", user1, 2);
        vm.stopPrank();
    }

    function test_RevertWhen_RegisterSubname_AgentAlreadyHasName() public {
        vm.startPrank(authorizedMinter);
        minter.registerSubname("first-name", user1, 1);

        vm.expectRevert("Agent already has name");
        minter.registerSubname("second-name", user1, 1);
        vm.stopPrank();
    }

    // ============ Validation Tests ============

    function test_IsNameAvailable() public {
        assertTrue(minter.isNameAvailable("available"));

        vm.prank(authorizedMinter);
        minter.registerSubname("taken", user1, 1);

        assertFalse(minter.isNameAvailable("taken"));
    }

    function test_IsNameAvailable_InvalidLabel() public {
        // Too short
        assertFalse(minter.isNameAvailable("ab"));

        // Too long (33 chars)
        assertFalse(minter.isNameAvailable("abcdefghijklmnopqrstuvwxyz1234567"));

        // Invalid characters
        assertFalse(minter.isNameAvailable("UPPERCASE"));
        assertFalse(minter.isNameAvailable("has space"));
        assertFalse(minter.isNameAvailable("has_underscore"));

        // Leading/trailing hyphen
        assertFalse(minter.isNameAvailable("-leading"));
        assertFalse(minter.isNameAvailable("trailing-"));
    }

    function test_ValidLabels() public view {
        assertTrue(minter.isNameAvailable("abc"));
        assertTrue(minter.isNameAvailable("test-agent"));
        assertTrue(minter.isNameAvailable("agent123"));
        assertTrue(minter.isNameAvailable("my-cool-agent-2024"));
    }

    // ============ Lookup Tests ============

    function test_GetAgentByNode() public {
        vm.prank(authorizedMinter);
        bytes32 node = minter.registerSubname("lookup-test", user1, 42);

        assertEq(minter.getAgentByNode(node), 42);
    }

    function test_GetNodeByAgent() public {
        vm.prank(authorizedMinter);
        bytes32 node = minter.registerSubname("node-test", user1, 99);

        assertEq(minter.getNodeByAgent(99), node);
    }

    // ============ Admin Tests ============

    function test_SetAuthorizedMinter() public {
        address newMinter = address(0x3);

        minter.setAuthorizedMinter(newMinter, true);
        assertTrue(minter.authorizedMinters(newMinter));

        minter.setAuthorizedMinter(newMinter, false);
        assertFalse(minter.authorizedMinters(newMinter));
    }

    function test_SetResolver() public {
        address newResolver = address(0x4);

        minter.setResolver(newResolver);
        assertEq(minter.resolver(), newResolver);
    }

    function test_RevertWhen_SetAuthorizedMinter_NotOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        minter.setAuthorizedMinter(user1, true);
    }
}
