import {
  parseAbiItem,
  type Address,
  type PublicClient,
  type Log,
} from 'viem';
import { YellFiHookABI, StrategyAgentABI } from './abis/index.js';
import { createChildLogger } from './logger.js';
import { createRobustPublicClient, withRetry } from './rpc-client.js';
import type { Config } from './config.js';

const logger = createChildLogger('event-listener');

export interface HookSignal {
  poolId: `0x${string}`;
  signalType: number;
  magnitude: bigint;
  timestamp: bigint;
}

export interface AgentEvent {
  agentId: bigint;
  eventType: 'created' | 'executed' | 'statusChanged';
  data: Record<string, unknown>;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export type SignalHandler = (signal: HookSignal) => Promise<void>;
export type AgentEventHandler = (event: AgentEvent) => Promise<void>;

/**
 * Event listener for YellFi contracts
 * Uses polling-based event fetching (compatible with public RPCs)
 */
export class EventListener {
  private client: PublicClient;
  private config: Config;
  private signalHandlers: SignalHandler[] = [];
  private agentEventHandlers: AgentEventHandler[] = [];
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastProcessedBlock: bigint = 0n;
  private readonly POLL_INTERVAL_MS = 12000; // ~1 block on Sepolia
  private readonly BLOCK_RANGE = 100n; // Max blocks to query at once

  constructor(config: Config) {
    this.config = config;
    this.client = createRobustPublicClient(config);
  }

  /**
   * Register handler for hook signals
   */
  onSignal(handler: SignalHandler): void {
    this.signalHandlers.push(handler);
  }

  /**
   * Register handler for agent events
   */
  onAgentEvent(handler: AgentEventHandler): void {
    this.agentEventHandlers.push(handler);
  }

  /**
   * Start listening for events using polling
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Event listener already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting event listener');

    // Get current block as starting point
    try {
      const currentBlock = await this.client.getBlockNumber();
      this.lastProcessedBlock = currentBlock;
      logger.info({ startBlock: currentBlock.toString() }, 'Event listener initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to get current block, starting from 0');
      this.lastProcessedBlock = 0n;
    }

    // Start polling for events
    this.pollInterval = setInterval(() => {
      this.pollEvents().catch((error) => {
        logger.error({ error }, 'Error polling events');
      });
    }, this.POLL_INTERVAL_MS);

    logger.info(
      {
        hookAddress: this.config.yellFiHookAddress,
        agentAddress: this.config.strategyAgentAddress,
        pollIntervalMs: this.POLL_INTERVAL_MS,
      },
      'Event listener started'
    );
  }

  /**
   * Stop listening for events
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    logger.info('Event listener stopped');
  }

  /**
   * Poll for new events
   */
  private async pollEvents(): Promise<void> {
    try {
      const currentBlock = await this.client.getBlockNumber();
      
      if (currentBlock <= this.lastProcessedBlock) {
        return; // No new blocks
      }

      const fromBlock = this.lastProcessedBlock + 1n;
      const toBlock = currentBlock > fromBlock + this.BLOCK_RANGE 
        ? fromBlock + this.BLOCK_RANGE 
        : currentBlock;

      // Fetch hook signals (only if hook address is set)
      if (this.config.yellFiHookAddress !== '0x0000000000000000000000000000000000000000') {
        await this.fetchSignalEvents(fromBlock, toBlock);
      }

      // Fetch agent events
      await this.fetchAgentCreatedEvents(fromBlock, toBlock);
      await this.fetchAgentExecutedEvents(fromBlock, toBlock);

      this.lastProcessedBlock = toBlock;
    } catch (error) {
      logger.error({ error }, 'Error in pollEvents');
    }
  }

  /**
   * Fetch SignalEmitted events
   */
  private async fetchSignalEvents(fromBlock: bigint, toBlock: bigint): Promise<void> {
    try {
      const logs = await this.client.getContractEvents({
        address: this.config.yellFiHookAddress,
        abi: YellFiHookABI,
        eventName: 'SignalEmitted',
        fromBlock,
        toBlock,
      });

      if (logs.length > 0) {
        await this.handleSignalLogs(logs as unknown as Log[]);
      }
    } catch (error) {
      logger.debug({ error, fromBlock: fromBlock.toString(), toBlock: toBlock.toString() }, 'Error fetching signal events');
    }
  }

  /**
   * Fetch AgentCreated events
   */
  private async fetchAgentCreatedEvents(fromBlock: bigint, toBlock: bigint): Promise<void> {
    try {
      const logs = await this.client.getContractEvents({
        address: this.config.strategyAgentAddress,
        abi: StrategyAgentABI,
        eventName: 'AgentCreated',
        fromBlock,
        toBlock,
      });

      if (logs.length > 0) {
        await this.handleAgentCreatedLogs(logs as unknown as Log[]);
      }
    } catch (error) {
      logger.debug({ error, fromBlock: fromBlock.toString(), toBlock: toBlock.toString() }, 'Error fetching agent created events');
    }
  }

  /**
   * Fetch AgentExecuted events
   */
  private async fetchAgentExecutedEvents(fromBlock: bigint, toBlock: bigint): Promise<void> {
    try {
      const logs = await this.client.getContractEvents({
        address: this.config.strategyAgentAddress,
        abi: StrategyAgentABI,
        eventName: 'AgentExecuted',
        fromBlock,
        toBlock,
      });

      if (logs.length > 0) {
        await this.handleAgentExecutedLogs(logs as unknown as Log[]);
      }
    } catch (error) {
      logger.debug({ error, fromBlock: fromBlock.toString(), toBlock: toBlock.toString() }, 'Error fetching agent executed events');
    }
  }

  /**
   * Get historical signals for a pool
   */
  async getHistoricalSignals(
    poolId: `0x${string}`,
    fromBlock: bigint,
    toBlock?: bigint
  ): Promise<HookSignal[]> {
    const logs = await this.client.getContractEvents({
      address: this.config.yellFiHookAddress,
      abi: YellFiHookABI,
      eventName: 'SignalEmitted',
      args: { poolId },
      fromBlock,
      toBlock: toBlock || 'latest',
    });

    return logs.map((log) => ({
      poolId: log.args.poolId!,
      signalType: log.args.signalType!,
      magnitude: log.args.magnitude!,
      timestamp: log.args.timestamp!,
    }));
  }

  private async handleSignalLogs(logs: Log[]): Promise<void> {
    for (const log of logs) {
      try {
        const args = (log as any).args;
        const signal: HookSignal = {
          poolId: args.poolId,
          signalType: args.signalType,
          magnitude: args.magnitude,
          timestamp: args.timestamp,
        };

        logger.info(
          {
            poolId: signal.poolId,
            signalType: signal.signalType,
            magnitude: signal.magnitude.toString(),
          },
          'Hook signal received'
        );

        for (const handler of this.signalHandlers) {
          await handler(signal);
        }
      } catch (error) {
        logger.error({ error, log }, 'Error handling signal log');
      }
    }
  }

  private async handleAgentCreatedLogs(logs: Log[]): Promise<void> {
    for (const log of logs) {
      try {
        const args = (log as any).args;
        const event: AgentEvent = {
          agentId: args.agentId,
          eventType: 'created',
          data: { owner: args.owner, ensName: args.ensName },
          blockNumber: log.blockNumber!,
          transactionHash: log.transactionHash!,
        };

        logger.info(
          { agentId: event.agentId.toString(), ensName: args.ensName },
          'Agent created'
        );

        for (const handler of this.agentEventHandlers) {
          await handler(event);
        }
      } catch (error) {
        logger.error({ error, log }, 'Error handling agent created log');
      }
    }
  }

  private async handleAgentExecutedLogs(logs: Log[]): Promise<void> {
    for (const log of logs) {
      try {
        const args = (log as any).args;
        const event: AgentEvent = {
          agentId: args.agentId,
          eventType: 'executed',
          data: {
            executionId: args.executionId,
            amountIn: args.amountIn.toString(),
            amountOut: args.amountOut.toString(),
          },
          blockNumber: log.blockNumber!,
          transactionHash: log.transactionHash!,
        };

        logger.info(
          {
            agentId: event.agentId.toString(),
            amountIn: args.amountIn.toString(),
            amountOut: args.amountOut.toString(),
          },
          'Agent executed'
        );

        for (const handler of this.agentEventHandlers) {
          await handler(event);
        }
      } catch (error) {
        logger.error({ error, log }, 'Error handling agent executed log');
      }
    }
  }
}

export function createEventListener(config: Config): EventListener {
  return new EventListener(config);
}
