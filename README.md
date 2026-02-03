#  YellFi — ENS-Named DeFi Strategy Agents (Sepolia)

YellFi is a next-generation DeFi automation prototype that lets users deploy ENS-named on-chain strategy agents that manage liquidity and execute rule-based trades using **Uniswap v4 hooks** and the **Yellow SDK** on the **Sepolia testnet**.

Each strategy agent has a human-readable ENS identity and runs programmable rules for swaps, liquidity positioning, and rebalancing — with all actions verifiable on-chain.

---

##  Overview

YellFi combines three core components:

- **ENS (Sepolia)** → human-readable identity for each strategy agent  
- **Uniswap v4** → programmable pools + hook-based liquidity logic  
- **Yellow SDK** → smart execution and routing layer  

Users deploy a strategy agent, assign it an ENS name, configure rules, and let it automatically manage liquidity or swaps under defined conditions.

---

##  Key Features

- ENS-named strategy agents
- Rule-based DeFi automation
- Uniswap v4 hook-powered liquidity logic
- Yellow SDK optimized execution routing
- Sepolia testnet deployment
- Transparent on-chain actions
- Modular agent contract design
- Simple dashboard for control & monitoring

---

##  Architecture

### Smart Contracts

**StrategyAgent.sol**
- Stores user strategy rules
- Controls execution permissions
- Triggers swaps and rebalances
- Emits monitoring events

**YellFiHook.sol (Uniswap v4 Hook)**
- Connects to v4 pools
- Applies rule-based behavior
- Supports dynamic liquidity positioning
- Can trigger rebalance flags

**ENS Integration**
- Sepolia ENS subnames
- Maps ENS name → agent contract
- Used as identity + UI label

---

### Off-Chain Coordinator

A lightweight TypeScript service:

- Watches contract events
- Evaluates rule triggers
- Calls agent execution functions
- Simulates keeper-style automation
- Keeps MVP simple and demo-friendly

---

### Frontend

Built with:

- React
- ethers.js / viem
- Sepolia RPC
- ENS resolution support

Functions:

- Deploy agent
- Assign ENS subname
- Configure strategy rules
- Monitor execution activity
- View pool + agent state

---

##  Tech Stack

- Solidity
- Uniswap v4 core + hooks
- Yellow SDK
- ENS (Sepolia)
- TypeScript
- React
- ethers.js / viem
- Hardhat / Foundry
- Sepolia testnet

---

##  Execution Flow

1. User deploys YellFi Strategy Agent
2. ENS subname is created and linked
3. Agent connects to Uniswap v4 pool
4. User defines rule set
5. Hook monitors pool behavior
6. Off-chain coordinator detects trigger
7. Yellow SDK executes optimal route
8. Agent updates liquidity or swap state

---

##  Testnet Only

YellFi is currently designed for:

- Sepolia testnet
- Demo strategies
- Experimental automation
- Hackathon / prototype usage

No real funds required.

---

##  Example Strategy Rules

- Rebalance liquidity if price moves ±3%
- Maintain token ratio in pool
- Execute periodic micro-swaps
- Adjust fee tier when volatility rises

---

##  Setup (Example)

```bash
git clone https://github.com/TeamCFS/Yellfi
cd yellfi
npm install
npx hardhat compile
npx hardhat deploy --network sepolia
npm run dev
