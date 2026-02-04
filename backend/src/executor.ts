import {
  createWalletClient,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { StrategyAgentABI } from './abis/index.js';
import { createChildLogger } from './logger.js';
import { createRobustPublicClient } from './rpc-client.js';
import { YellowSDK, createYellowSDK, type YellowQuote } from './yellow-sdk.js';
import type { Config } from './config.js';
import type { EvaluationResult, AgentConfig } from './rule-evaluator.js';

const logger = createChildLogger('executor');

export interface ExecutionResult {
  agentId: bigint;
  ruleIndex: number;
  success: boolean;
  transactionHash?: `0x${string}`;
  executionId?: string;
  error?: string;
  gasUsed?: bigint;
  executionMode: 'state-channel' | 'on-chain';
}

/**
 * Executes strategy agent rules via Yellow Network state channels or on-chain fallback
 */
export class Executor {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private yellowSDK: YellowSDK;
  private config: Config;
  private account: ReturnType<typeof privateKeyToAccount>;
  private isYellowConnected = false;

  constructor(config: Config) {
    this.config = config;
    this.account = privateKeyToAccount(config.keeperPrivateKey);

    // Use robust public client with fallback RPCs
    this.publicClient = createRobustPublicClient(config);

    this.walletClient = createWalletClient({
      account: this.account,
      chain: sepolia,
      transport: http(config.rpcUrl),
    });

    // Initialize Yellow SDK with state channel support
    this.yellowSDK = createYellowSDK({
      privateKey: config.keeperPrivateKey,
      useSandbox: true, // Use sandbox for Sepolia testnet
    });
  }

  /**
   * Initialize Yellow Network connection
   */
  async initializeYellowNetwork(): Promise<void> {
    try {
      await this.yellowSDK.connect();
      this.isYellowConnected = true;
      logger.info('Yellow Network state channel initialized');
    } catch (error) {
      logger.warn({ error }, 'Failed to connect to Yellow Network, will use on-chain fallback');
      this.isYellowConnected = false;
    }
  }

  /**
   * Execute a rule that has been evaluated as ready
   * Attempts state channel execution first, falls back to on-chain
   */
  async execute(
    evaluation: EvaluationResult,
    agent: AgentConfig
  ): Promise<ExecutionResult> {
    const { agentId, ruleIndex } = evaluation;

    logger.info(
      { agentId: agentId.toString(), ruleIndex, reason: evaluation.reason },
      'Executing rule'
    );

    try {
      // Get quote from Yellow SDK
      const quote = await this.yellowSDK.getQuote(
        agent.poolKey.currency0,
        agent.poolKey.currency1,
        agent.depositedAmount / 10n, // Execute 10% of position
        50 // 0.5% slippage
      );

      // Validate route is still valid
      const isValid = await this.yellowSDK.validateRoute(quote);
      if (!isValid) {
        return {
          agentId,
          ruleIndex,
          success: false,
          error: 'Route no longer valid',
          executionMode: 'state-channel',
        };
      }

      // Try state channel execution first (instant, gasless)
      if (this.isYellowConnected) {
        try {
          const stateChannelResult = await this.executeViaStateChannel(
            agentId,
            quote,
            agent
          );
          if (stateChannelResult.success) {
            return stateChannelResult;
          }
        } catch (error) {
          logger.warn({ error }, 'State channel execution failed, falling back to on-chain');
        }
      }

      // Fallback to on-chain execution
      const minAmountOut = (quote.amountOut * 995n) / 1000n; // 0.5% slippage
      const executionData = this.yellowSDK.buildExecutionData(
        agentId,
        quote,
        minAmountOut
      );

      const result = await this.executeWithRetry(
        agentId,
        BigInt(ruleIndex),
        executionData
      );

      return { ...result, executionMode: 'on-chain' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { error, agentId: agentId.toString(), ruleIndex },
        'Execution failed'
      );

      return {
        agentId,
        ruleIndex,
        success: false,
        error: errorMessage,
        executionMode: 'on-chain',
      };
    }
  }

  /**
   * Execute via Yellow Network state channel (instant, gasless)
   */
  private async executeViaStateChannel(
    agentId: bigint,
    quote: YellowQuote,
    agent: AgentConfig
  ): Promise<ExecutionResult> {
    logger.info({ agentId: agentId.toString() }, 'Attempting state channel execution');

    // Create app session for this execution
    const session = await this.yellowSDK.createAppSession(
      [this.account.address, agent.owner],
      [
        { participant: this.account.address, asset: 'ETH', amount: quote.amountIn.toString() },
        { participant: agent.owner, asset: 'ETH', amount: '0' },
      ]
    );

    // Execute swap through state channel
    const result = await this.yellowSDK.executeSwap(
      session.sessionId,
      quote,
      this.account.address,
      agent.owner
    );

    // Close session after execution
    await this.yellowSDK.closeAppSession(session.sessionId);

    logger.info(
      { agentId: agentId.toString(), executionId: result.executionId },
      'State channel execution completed'
    );

    return {
      agentId,
      ruleIndex: 0,
      success: result.success,
      executionId: result.executionId,
      executionMode: 'state-channel',
    };
  }

  /**
   * Execute with retry logic (on-chain fallback)
   */
  private async executeWithRetry(
    agentId: bigint,
    ruleIndex: bigint,
    executionData: `0x${string}`
  ): Promise<Omit<ExecutionResult, 'executionMode'>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        logger.info(
          { agentId: agentId.toString(), ruleIndex: Number(ruleIndex), attempt },
          'Attempting on-chain execution'
        );

        // Simulate transaction first
        const { request } = await this.publicClient.simulateContract({
          address: this.config.strategyAgentAddress,
          abi: StrategyAgentABI,
          functionName: 'execute',
          args: [agentId, ruleIndex, executionData],
          account: this.account,
        });

        // Execute transaction
        const hash = await this.walletClient.writeContract(request);

        // Wait for confirmation
        const receipt = await this.publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
        });

        logger.info(
          {
            agentId: agentId.toString(),
            ruleIndex: Number(ruleIndex),
            hash,
            gasUsed: receipt.gasUsed.toString(),
          },
          'On-chain execution successful'
        );

        return {
          agentId,
          ruleIndex: Number(ruleIndex),
          success: true,
          transactionHash: hash,
          gasUsed: receipt.gasUsed,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        logger.warn(
          {
            error: lastError.message,
            agentId: agentId.toString(),
            ruleIndex: Number(ruleIndex),
            attempt,
          },
          'On-chain execution attempt failed'
        );

        if (attempt < this.config.maxRetries) {
          await this.delay(this.config.retryDelayMs * attempt);
        }
      }
    }

    return {
      agentId,
      ruleIndex: Number(ruleIndex),
      success: false,
      error: lastError?.message || 'Max retries exceeded',
    };
  }

  /**
   * Estimate gas for execution
   */
  async estimateGas(
    agentId: bigint,
    ruleIndex: bigint,
    executionData: `0x${string}`
  ): Promise<bigint> {
    const gas = await this.publicClient.estimateContractGas({
      address: this.config.strategyAgentAddress,
      abi: StrategyAgentABI,
      functionName: 'execute',
      args: [agentId, ruleIndex, executionData],
      account: this.account,
    });

    return gas;
  }

  /**
   * Get keeper address
   */
  getKeeperAddress(): Address {
    return this.account.address;
  }

  /**
   * Get keeper balance
   */
  async getKeeperBalance(): Promise<bigint> {
    return this.publicClient.getBalance({ address: this.account.address });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function createExecutor(config: Config): Executor {
  return new Executor(config);
}
