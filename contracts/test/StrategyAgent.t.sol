// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {StrategyAgent} from "../src/StrategyAgent.sol";
import {IStrategyAgent} from "../src/interfaces/IYellFi.sol";
import {MockExecutorAdapter} from "./mocks/MockExecutorAdapter.sol";
import {MockEnsSubnameMinter} from "./mocks/MockEnsSubnameMinter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";

contract StrategyAgentTest is Test {
    StrategyAgent public agent;
    MockExecutorAdapter public executor;
    MockEnsSubnameMinter public ensMinter;
    MockERC20 public token0;
    MockERC20 public token1;

    address public owner = address(this);
    address public user1 = address(0x1);
    address public user2 = address(0x2);
    address public keeper = address(0x3);

    PoolKey public defaultPoolKey;

    function setUp() public {
        // Deploy mocks
        executor = new MockExecutorAdapter();
        ensMinter = new MockEnsSubnameMinter();
        token0 = new MockERC20("Token0", "TKN0");
        token1 = new MockERC20("Token1", "TKN1");

        // Deploy agent
        agent = new StrategyAgent(
            address(executor),
            address(ensMinter),
            owner
        );

        // Set keeper
        agent.setKeeper(keeper, true);

        // Setup default pool key
        defaultPoolKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        // Mint tokens to users
        token0.mint(user1, 100 ether);
        token1.mint(user1, 100 ether);
        token0.mint(user2, 100 ether);
        token1.mint(user2, 100 ether);

        // Approve agent
        vm.startPrank(user1);
        token0.approve(address(agent), type(uint256).max);
        token1.approve(address(agent), type(uint256).max);
        vm.stopPrank();
    }

    // ============ Agent Creation Tests ============

    function test_CreateAgent() public {
        IStrategyAgent.Rule[] memory rules = new IStrategyAgent.Rule[](1);
        rules[0] = IStrategyAgent.Rule({
            ruleType: IStrategyAgent.RuleType.REBALANCE_THRESHOLD,
            threshold: 500, // 5%
            targetValue: 0,
            cooldown: 300,
            lastExecuted: 0,
            enabled: true
        });

        vm.prank(user1);
        uint256 agentId = agent.createAgent("test-agent", defaultPoolKey, rules);

        assertEq(agentId, 1);
        
        IStrategyAgent.AgentConfig memory config = agent.getAgent(agentId);
        assertEq(config.owner, user1);
        assertEq(config.ensName, "test-agent");
        assertEq(uint8(config.status), uint8(IStrategyAgent.AgentStatus.ACTIVE));
    }

    function test_CreateAgent_MultipleRules() public {
        IStrategyAgent.Rule[] memory rules = new IStrategyAgent.Rule[](3);
        rules[0] = _createRule(IStrategyAgent.RuleType.REBALANCE_THRESHOLD, 500, 0, 300);
        rules[1] = _createRule(IStrategyAgent.RuleType.STOP_LOSS, 1000, 0, 60);
        rules[2] = _createRule(IStrategyAgent.RuleType.TIME_WEIGHTED, 0, 3600, 3600);

        vm.prank(user1);
        uint256 agentId = agent.createAgent("multi-rule", defaultPoolKey, rules);

        IStrategyAgent.Rule[] memory storedRules = agent.getRules(agentId);
        assertEq(storedRules.length, 3);
    }

    function test_RevertWhen_CreateAgent_EmptyName() public {
        IStrategyAgent.Rule[] memory rules = new IStrategyAgent.Rule[](0);

        vm.prank(user1);
        vm.expectRevert("ENS name required");
        agent.createAgent("", defaultPoolKey, rules);
    }

    function test_RevertWhen_CreateAgent_TooManyRules() public {
        IStrategyAgent.Rule[] memory rules = new IStrategyAgent.Rule[](11);
        for (uint256 i = 0; i < 11; i++) {
            rules[i] = _createRule(IStrategyAgent.RuleType.REBALANCE_THRESHOLD, 500, 0, 300);
        }

        vm.prank(user1);
        vm.expectRevert("Too many rules");
        agent.createAgent("too-many", defaultPoolKey, rules);
    }

    // ============ Rule Management Tests ============

    function test_AddRule() public {
        uint256 agentId = _createDefaultAgent(user1);

        IStrategyAgent.Rule memory newRule = _createRule(
            IStrategyAgent.RuleType.STOP_LOSS,
            1000,
            0,
            60
        );

        vm.prank(user1);
        agent.addRule(agentId, newRule);

        IStrategyAgent.Rule[] memory rules = agent.getRules(agentId);
        assertEq(rules.length, 2);
        assertEq(uint8(rules[1].ruleType), uint8(IStrategyAgent.RuleType.STOP_LOSS));
    }

    function test_UpdateRule() public {
        uint256 agentId = _createDefaultAgent(user1);

        IStrategyAgent.Rule memory updatedRule = _createRule(
            IStrategyAgent.RuleType.REBALANCE_THRESHOLD,
            1000, // Changed threshold
            0,
            600  // Changed cooldown
        );

        vm.prank(user1);
        agent.updateRule(agentId, 0, updatedRule);

        IStrategyAgent.Rule[] memory rules = agent.getRules(agentId);
        assertEq(rules[0].threshold, 1000);
        assertEq(rules[0].cooldown, 600);
    }

    function test_RemoveRule() public {
        uint256 agentId = _createDefaultAgent(user1);

        // Add another rule first
        vm.prank(user1);
        agent.addRule(agentId, _createRule(IStrategyAgent.RuleType.STOP_LOSS, 1000, 0, 60));

        IStrategyAgent.Rule[] memory rulesBefore = agent.getRules(agentId);
        assertEq(rulesBefore.length, 2);

        vm.prank(user1);
        agent.removeRule(agentId, 0);

        IStrategyAgent.Rule[] memory rulesAfter = agent.getRules(agentId);
        assertEq(rulesAfter.length, 1);
    }

    function test_RevertWhen_AddRule_NotOwner() public {
        uint256 agentId = _createDefaultAgent(user1);

        vm.prank(user2);
        vm.expectRevert("Not agent owner");
        agent.addRule(agentId, _createRule(IStrategyAgent.RuleType.STOP_LOSS, 1000, 0, 60));
    }

    // ============ Deposit/Withdraw Tests ============

    function test_Deposit() public {
        uint256 agentId = _createDefaultAgent(user1);
        uint256 depositAmount = 10 ether;

        vm.prank(user1);
        agent.deposit(agentId, address(token0), depositAmount);

        assertEq(agent.getAgentBalance(agentId, address(token0)), depositAmount);
        assertEq(token0.balanceOf(address(agent)), depositAmount);
    }

    function test_Withdraw() public {
        uint256 agentId = _createDefaultAgent(user1);
        uint256 depositAmount = 10 ether;
        uint256 withdrawAmount = 5 ether;

        vm.startPrank(user1);
        agent.deposit(agentId, address(token0), depositAmount);
        agent.withdraw(agentId, address(token0), withdrawAmount);
        vm.stopPrank();

        assertEq(agent.getAgentBalance(agentId, address(token0)), depositAmount - withdrawAmount);
        assertEq(token0.balanceOf(user1), 100 ether - depositAmount + withdrawAmount);
    }

    function test_RevertWhen_Withdraw_InsufficientBalance() public {
        uint256 agentId = _createDefaultAgent(user1);

        vm.prank(user1);
        agent.deposit(agentId, address(token0), 5 ether);

        vm.prank(user1);
        vm.expectRevert("Insufficient balance");
        agent.withdraw(agentId, address(token0), 10 ether);
    }

    function test_RevertWhen_Withdraw_NotOwner() public {
        uint256 agentId = _createDefaultAgent(user1);

        vm.prank(user1);
        agent.deposit(agentId, address(token0), 10 ether);

        vm.prank(user2);
        vm.expectRevert("Not agent owner");
        agent.withdraw(agentId, address(token0), 5 ether);
    }

    // ============ Execution Tests ============

    function test_CanExecute() public {
        uint256 agentId = _createDefaultAgent(user1);

        // Warp time forward to ensure cooldown from timestamp 0 has elapsed
        vm.warp(block.timestamp + 400);

        bool canExec = agent.canExecute(agentId, 0);
        assertTrue(canExec);
    }

    function test_CanExecute_CooldownNotElapsed() public {
        uint256 agentId = _createDefaultAgent(user1);

        // At timestamp 0, cooldown from lastExecuted=0 hasn't elapsed (300s cooldown)
        // So canExecute should be false initially
        bool canExec = agent.canExecute(agentId, 0);
        // Initially false because block.timestamp (1) - lastExecuted (0) < cooldown (300)
        assertFalse(canExec);

        // Warp past cooldown
        vm.warp(block.timestamp + 400);
        canExec = agent.canExecute(agentId, 0);
        assertTrue(canExec);
    }

    function test_CanExecute_RuleDisabled() public {
        IStrategyAgent.Rule[] memory rules = new IStrategyAgent.Rule[](1);
        rules[0] = IStrategyAgent.Rule({
            ruleType: IStrategyAgent.RuleType.REBALANCE_THRESHOLD,
            threshold: 500,
            targetValue: 0,
            cooldown: 300,
            lastExecuted: 0,
            enabled: false // Disabled
        });

        vm.prank(user1);
        uint256 agentId = agent.createAgent("disabled-rule", defaultPoolKey, rules);

        bool canExec = agent.canExecute(agentId, 0);
        assertFalse(canExec);
    }

    // ============ Pause/Unpause Tests ============

    function test_Pause() public {
        uint256 agentId = _createDefaultAgent(user1);

        vm.prank(user1);
        agent.pause(agentId);

        IStrategyAgent.AgentConfig memory config = agent.getAgent(agentId);
        assertEq(uint8(config.status), uint8(IStrategyAgent.AgentStatus.PAUSED));
    }

    function test_Unpause() public {
        uint256 agentId = _createDefaultAgent(user1);

        vm.startPrank(user1);
        agent.pause(agentId);
        agent.unpause(agentId);
        vm.stopPrank();

        IStrategyAgent.AgentConfig memory config = agent.getAgent(agentId);
        assertEq(uint8(config.status), uint8(IStrategyAgent.AgentStatus.ACTIVE));
    }

    function test_RevertWhen_Pause_NotOwner() public {
        uint256 agentId = _createDefaultAgent(user1);

        vm.prank(user2);
        vm.expectRevert("Not agent owner");
        agent.pause(agentId);
    }

    // ============ Admin Tests ============

    function test_SetKeeper() public {
        address newKeeper = address(0x4);
        
        agent.setKeeper(newKeeper, true);
        assertTrue(agent.keepers(newKeeper));

        agent.setKeeper(newKeeper, false);
        assertFalse(agent.keepers(newKeeper));
    }

    function test_EmergencyPause() public {
        agent.emergencyPause();
        
        IStrategyAgent.Rule[] memory rules = new IStrategyAgent.Rule[](0);
        
        vm.prank(user1);
        vm.expectRevert();
        agent.createAgent("paused", defaultPoolKey, rules);
    }

    // ============ View Functions Tests ============

    function test_GetAgentsByOwner() public {
        vm.startPrank(user1);
        agent.createAgent("agent1", defaultPoolKey, new IStrategyAgent.Rule[](0));
        agent.createAgent("agent2", defaultPoolKey, new IStrategyAgent.Rule[](0));
        vm.stopPrank();

        uint256[] memory userAgents = agent.getAgentsByOwner(user1);
        assertEq(userAgents.length, 2);
        assertEq(userAgents[0], 1);
        assertEq(userAgents[1], 2);
    }

    function test_GetAgentByEns() public {
        vm.prank(user1);
        uint256 agentId = agent.createAgent("my-agent", defaultPoolKey, new IStrategyAgent.Rule[](0));

        uint256 foundId = agent.getAgentByEns("my-agent");
        assertEq(foundId, agentId);
    }

    function test_TotalAgents() public {
        assertEq(agent.totalAgents(), 0);

        _createDefaultAgent(user1);
        assertEq(agent.totalAgents(), 1);

        _createDefaultAgent(user2);
        assertEq(agent.totalAgents(), 2);
    }

    // ============ Helper Functions ============

    uint256 private _agentCounter = 0;

    function _createDefaultAgent(address user) internal returns (uint256) {
        IStrategyAgent.Rule[] memory rules = new IStrategyAgent.Rule[](1);
        rules[0] = _createRule(IStrategyAgent.RuleType.REBALANCE_THRESHOLD, 500, 0, 300);

        string memory ensName = string(abi.encodePacked("agent-", vm.toString(_agentCounter++)));

        vm.prank(user);
        return agent.createAgent(ensName, defaultPoolKey, rules);
    }

    function _createRule(
        IStrategyAgent.RuleType ruleType,
        uint256 threshold,
        uint256 targetValue,
        uint256 cooldown
    ) internal pure returns (IStrategyAgent.Rule memory) {
        return IStrategyAgent.Rule({
            ruleType: ruleType,
            threshold: threshold,
            targetValue: targetValue,
            cooldown: cooldown,
            lastExecuted: 0,
            enabled: true
        });
    }
}
