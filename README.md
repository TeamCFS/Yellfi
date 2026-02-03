# YellFi

ENS-named DeFi strategy agents using Uniswap v4 hooks and Yellow SDK routing.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         YellFi System                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Frontend   │    │   Backend    │    │  Contracts   │      │
│  │   (React)    │◄──►│  (Keeper)    │◄──►│  (Solidity)  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌──────────────────────────────────────────────────────┐      │
│  │                    Sepolia Testnet                    │      │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐      │      │
│  │  │ Uniswap v4 │  │    ENS     │  │ Yellow SDK │      │      │
│  │  │   Hooks    │  │  Registry  │  │   Router   │      │      │
│  │  └────────────┘  └────────────┘  └────────────┘      │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Components

**Smart Contracts**
- `StrategyAgent.sol` - Core agent management with rule-based automation
- `YellFiHook.sol` - Uniswap v4 hook emitting signals on swaps/liquidity changes
- `YellowExecutorAdapter.sol` - Yellow SDK integration for optimal routing
- `EnsSubnameMinter.sol` - ENS subname registration (agent.yellfi.eth)

**Backend Service**
- Event listener for hook signals
- Rule evaluator checking agent conditions
- Executor calling Yellow SDK for swaps
- Retry logic and structured logging

**Frontend Dashboard**
- Agent management and monitoring
- Deploy wizard with ENS naming
- Strategy editor with rule configuration
- Execution timeline and metrics

## Contract Flow

```
1. User creates agent via StrategyAgent.createAgent()
   └── ENS subname registered (e.g., myagent.yellfi.eth)
   └── Rules configured (thresholds, cooldowns)
   └── Pool attached (Uniswap v4 with YellFiHook)

2. YellFiHook monitors pool activity
   └── afterSwap() detects price impact
   └── afterAddLiquidity() tracks liquidity changes
   └── Emits SignalEmitted events

3. Backend keeper evaluates rules
   └── Listens for hook signals
   └── Checks rule conditions (threshold, cooldown)
   └── Fetches Yellow SDK quote

4. Execution via YellowExecutorAdapter
   └── Optimal routing from Yellow SDK
   └── Swap executed on-chain
   └── Agent balances updated
```

## Sepolia Deployment

### Prerequisites

- Foundry installed
- Sepolia ETH for gas
- RPC endpoint (Infura/Alchemy)

### Deploy Contracts

```bash
cd contracts

# Copy environment template
cp .env.example .env
# Edit .env with your values

# Install dependencies
forge install

# Deploy all contracts
forge script script/DeployYellFi.s.sol:DeployYellFi \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify
```

### Run Tests

```bash
cd contracts
forge test -vvv
```

### Contract Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| StrategyAgent | `0xeacaA7E2A7518DA96d6B4d92B2f367eBEd965b30` |
| YellowExecutorAdapter | `0x6aF9e2d880cbB65f5e37Bd951BdA146e6D893f42` |
| EnsSubnameMinter | `0xDAa52313A587Dc21247BC1D3D229ba21e99ebd17` |

View on Etherscan:
- [StrategyAgent](https://sepolia.etherscan.io/address/0xeacaA7E2A7518DA96d6B4d92B2f367eBEd965b30)
- [YellowExecutorAdapter](https://sepolia.etherscan.io/address/0x6aF9e2d880cbB65f5e37Bd951BdA146e6D893f42)
- [EnsSubnameMinter](https://sepolia.etherscan.io/address/0xDAa52313A587Dc21247BC1D3D229ba21e99ebd17)

## Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with contract addresses and keeper key

# Run in development
npm run dev

# Build and run production
npm run build
npm start
```

## Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## ENS Integration

Agents are identified by ENS subnames under `yellfi.eth`:

```
myagent.yellfi.eth  →  Agent #1
trader.yellfi.eth   →  Agent #2
```

The `EnsSubnameMinter` contract:
1. Validates label format (3-32 chars, lowercase alphanumeric + hyphens)
2. Registers subnode in ENS registry
3. Sets resolver records (address, agentId text record)
4. Maps agent ID ↔ ENS name bidirectionally

## Hook Signals

YellFiHook emits signals that agents can react to:

| Signal | Trigger | Use Case |
|--------|---------|----------|
| `PRICE_IMPACT` | Swap moves price >1% | Rebalancing |
| `LIQUIDITY_CHANGE` | Large LP add/remove | Range adjustment |
| `VOLATILITY_SPIKE` | Rapid price changes | Risk management |
| `REBALANCE_NEEDED` | Position out of range | LP optimization |

## Rule Types

| Rule | Description | Parameters |
|------|-------------|------------|
| `REBALANCE_THRESHOLD` | Trigger on price movement | threshold (bps) |
| `TIME_WEIGHTED` | Execute at intervals | targetValue (seconds) |
| `STOP_LOSS` | Exit at loss threshold | threshold (bps) |
| `TAKE_PROFIT` | Take profit at target | threshold (bps) |
| `CUSTOM_HOOK_SIGNAL` | React to specific signal | targetValue (signal type) |

## Yellow Network Integration

YellFi integrates with Yellow Network's state channel infrastructure for instant, gasless execution:

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Yellow Network                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  ClearNode  │◄──►│ App Session │◄──►│  Nitrolite  │     │
│  │  (WebSocket)│    │   (State)   │    │  Protocol   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
         ▲
         │ WebSocket (NitroRPC/0.4)
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    YellFi Backend                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Yellow SDK  │◄──►│  Executor   │◄──►│   Keeper    │     │
│  │  (Client)   │    │             │    │   Service   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Execution Flow

1. **State Channel (Primary)** - Instant, gasless
   - Connect to ClearNode via WebSocket
   - Create app session with participants
   - Submit state updates for swaps
   - Close session to finalize

2. **On-Chain (Fallback)** - When state channels unavailable
   - Execute via YellowExecutorAdapter contract
   - Standard blockchain transaction with gas

### ClearNode Endpoints

| Environment | WebSocket URL |
|-------------|---------------|
| Production | `wss://clearnet.yellow.com/ws` |
| Sandbox | `wss://clearnet-sandbox.yellow.com/ws` |

For Sepolia testnet, use the sandbox endpoint.

### NitroRPC Protocol

Yellow Network uses NitroRPC/0.4 for state channel communication:

```typescript
// Create app session
{
  "jsonrpc": "2.0",
  "method": "create_app_session",
  "params": [{
    "definition": { "protocol": "NitroRPC/0.4", ... },
    "allocations": [...]
  }]
}

// Submit state update
{
  "jsonrpc": "2.0", 
  "method": "submit_app_state",
  "params": [{
    "app_session_id": "0x...",
    "allocations": [...],
    "intent": "OPERATE"
  }]
}
```

### Benefits

- **Instant execution** - No block confirmation wait
- **Gasless** - State updates don't require gas
- **Atomic** - Multi-step operations in single state update
- **Secure** - Cryptographic signatures, on-chain fallback

## UI Theming

Brand colors extracted from logo:

```typescript
// Primary - Yellow/Gold
primary: '#F7B928'

// Secondary - Blue
secondary: '#00A3FF'

// Accent - Cyan
accent: '#00D4FF'

// Background - Dark space
background: '#0A1628'
```

## Project Structure

```
yellfi/
├── contracts/
│   ├── src/
│   │   ├── StrategyAgent.sol
│   │   ├── YellFiHook.sol
│   │   ├── YellowExecutorAdapter.sol
│   │   ├── EnsSubnameMinter.sol
│   │   └── interfaces/
│   ├── script/
│   ├── test/
│   └── foundry.toml
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   ├── event-listener.ts
│   │   ├── rule-evaluator.ts
│   │   ├── executor.ts
│   │   └── yellow-sdk.ts
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── theme/
│   │   └── App.tsx
│   └── package.json
├── assets/
│   └── logo.png
└── README.md
```

## Demo Walkthrough

1. **Connect Wallet** - Connect MetaMask to Sepolia
2. **Deploy Agent** - Use wizard to create agent with ENS name
3. **Configure Rules** - Set thresholds and cooldowns
4. **Deposit Funds** - Add tokens to agent
5. **Monitor** - Watch execution timeline as rules trigger
6. **Adjust** - Edit rules in strategy editor

## Security Considerations

- Agents can only be controlled by their owner
- Keepers are whitelisted for execution
- Cooldowns prevent rapid-fire executions
- Slippage protection on all swaps
- Emergency pause available to admin
- ReentrancyGuard on all state-changing functions

## License

MIT
