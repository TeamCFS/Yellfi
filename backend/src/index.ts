import { loadConfig } from './config.js';
import { createEventListener } from './event-listener.js';
import { createRuleEvaluator } from './rule-evaluator.js';
import { createExecutor } from './executor.js';
import { createApiServer, type ApiServer } from './api-server.js';
import { logger } from './logger.js';

// Global API server reference for recording executions
let apiServer: ApiServer;

/**
 * YellFi Automation Service
 * 
 * Keeper service that:
 * 1. Listens for hook signals from YellFi contracts
 * 2. Evaluates agent rules against current conditions
 * 3. Executes strategies via Yellow Network state channels (instant, gasless)
 * 4. Falls back to on-chain execution if state channels unavailable
 * 5. Provides HTTP API for frontend to query execution history
 */
async function main() {
  logger.info('Starting YellFi Automation Service');

  // Load configuration
  const config = loadConfig();
  logger.info(
    {
      chainId: config.chainId,
      strategyAgent: config.strategyAgentAddress,
      hook: config.yellFiHookAddress,
      pollInterval: config.pollIntervalMs,
      yellowSandbox: config.yellowUseSandbox,
    },
    'Configuration loaded'
  );

  // Initialize API server
  const apiPort = parseInt(process.env.API_PORT || '3001');
  apiServer = createApiServer(config, apiPort);
  await apiServer.start();

  // Initialize components
  const eventListener = createEventListener(config);
  const ruleEvaluator = createRuleEvaluator(config);
  const executor = createExecutor(config);

  // Initialize Yellow Network state channel connection (non-blocking)
  logger.info('Initializing Yellow Network state channels...');
  try {
    await executor.initializeYellowNetwork();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn({ error: errorMessage }, 'Yellow Network initialization failed, using on-chain fallback only');
  }

  // Log keeper info
  const keeperAddress = executor.getKeeperAddress();
  const keeperBalance = await executor.getKeeperBalance();
  logger.info(
    {
      keeper: keeperAddress,
      balance: `${Number(keeperBalance) / 1e18} ETH`,
    },
    'Keeper initialized'
  );

  // Handle hook signals
  eventListener.onSignal(async (signal) => {
    logger.info(
      {
        poolId: signal.poolId,
        signalType: signal.signalType,
        magnitude: signal.magnitude.toString(),
      },
      'Processing hook signal'
    );

    // Evaluate all agents when signal received
    await evaluateAndExecuteAgents(ruleEvaluator, executor);
  });

  // Handle agent events
  eventListener.onAgentEvent(async (event) => {
    logger.info(
      {
        agentId: event.agentId.toString(),
        eventType: event.eventType,
        txHash: event.transactionHash,
      },
      'Agent event received'
    );
  });

  // Start event listener
  await eventListener.start();

  // Periodic evaluation loop
  const pollInterval = setInterval(async () => {
    await evaluateAndExecuteAgents(ruleEvaluator, executor);
  }, config.pollIntervalMs);

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    clearInterval(pollInterval);
    eventListener.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('YellFi Automation Service running');
}

/**
 * Evaluate all agents and execute ready rules
 */
async function evaluateAndExecuteAgents(
  ruleEvaluator: ReturnType<typeof createRuleEvaluator>,
  executor: ReturnType<typeof createExecutor>
) {
  try {
    const totalAgents = await ruleEvaluator.getTotalAgents();
    logger.info({ totalAgents: totalAgents.toString() }, '=== Starting evaluation cycle ===');

    let readyRulesCount = 0;
    let executedCount = 0;
    let failedCount = 0;

    for (let i = 1n; i <= totalAgents; i++) {
      logger.info({ agentId: i.toString() }, 'Evaluating agent');
      const evaluations = await ruleEvaluator.evaluateAgent(i);

      logger.info({
        agentId: i.toString(),
        evaluationsCount: evaluations.length,
        readyToExecute: evaluations.filter(e => e.shouldExecute).length,
      }, 'Agent evaluation complete');

      for (const evaluation of evaluations) {
        if (evaluation.shouldExecute) {
          readyRulesCount++;
          logger.info(
            {
              agentId: evaluation.agentId.toString(),
              ruleIndex: evaluation.ruleIndex,
              reason: evaluation.reason,
            },
            '>>> Rule ready for execution <<<'
          );

          const agent = await ruleEvaluator.getAgent(evaluation.agentId);
          const rules = await ruleEvaluator.getRules(evaluation.agentId);
          const rule = rules[evaluation.ruleIndex];

          logger.info({
            agentId: evaluation.agentId.toString(),
            ruleIndex: evaluation.ruleIndex,
            agentDeposit: agent.depositedAmount.toString(),
            ruleType: rule.ruleType,
          }, 'Executing rule...');

          const result = await executor.execute(evaluation, agent);

          // Record execution in API server
          apiServer.recordExecution({
            agentId: result.agentId,
            ruleIndex: result.ruleIndex,
            success: result.success,
            transactionHash: result.transactionHash,
            executionId: result.executionId,
            error: result.error,
            executionMode: result.executionMode,
            ruleType: rule ? Number(rule.ruleType) : undefined,
            threshold: rule ? Number(rule.threshold) : undefined,
          });

          // Update agent status
          apiServer.updateAgentStatus(evaluation.agentId, {
            lastEvaluation: Date.now(),
            totalExecutions: (apiServer as any).executions?.filter(
              (e: any) => e.agentId.toString() === evaluation.agentId.toString()
            ).length || 0,
          });

          if (result.success) {
            executedCount++;
            logger.info(
              {
                agentId: result.agentId.toString(),
                ruleIndex: result.ruleIndex,
                txHash: result.transactionHash,
                executionId: result.executionId,
                mode: result.executionMode,
              },
              `✅ Execution completed via ${result.executionMode}`
            );
          } else {
            failedCount++;
            logger.error(
              {
                agentId: result.agentId.toString(),
                ruleIndex: result.ruleIndex,
                error: result.error,
                mode: result.executionMode,
              },
              '❌ Execution failed'
            );
          }
        }
      }
    }

    logger.info({
      totalAgents: totalAgents.toString(),
      readyRulesCount,
      executedCount,
      failedCount,
    }, '=== Evaluation cycle complete ===');
  } catch (error) {
    logger.error({ error }, 'Error in evaluation loop');
  }
}

// Run
main().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  logger.fatal({ error: errorMessage, stack: errorStack }, 'Fatal error');
  process.exit(1);
});
