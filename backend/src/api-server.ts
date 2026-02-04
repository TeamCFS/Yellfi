import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createChildLogger } from './logger.js';
import type { Config } from './config.js';

const logger = createChildLogger('api-server');

export interface ExecutionRecord {
  id: string;
  agentId: bigint;
  ruleIndex: number;
  timestamp: number;
  success: boolean;
  transactionHash?: string;
  executionId?: string;
  error?: string;
  executionMode: 'state-channel' | 'on-chain';
  ruleType?: number;
  threshold?: number;
}

export interface AgentStatus {
  agentId: bigint;
  isActive: boolean;
  lastEvaluation: number;
  pendingExecutions: number;
  totalExecutions: number;
}

/**
 * Simple HTTP API server for frontend communication
 */
export class ApiServer {
  private server: ReturnType<typeof createServer> | null = null;
  private executions: ExecutionRecord[] = [];
  private agentStatuses: Map<string, AgentStatus> = new Map();
  private config: Config;
  private port: number;

  constructor(config: Config, port: number = 3001) {
    this.config = config;
    this.port = port;
  }

  /**
   * Record an execution
   */
  recordExecution(record: Omit<ExecutionRecord, 'id' | 'timestamp'>): void {
    const execution: ExecutionRecord = {
      ...record,
      id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    
    this.executions.unshift(execution);
    
    // Keep only last 1000 executions
    if (this.executions.length > 1000) {
      this.executions = this.executions.slice(0, 1000);
    }

    logger.info({ executionId: execution.id, agentId: record.agentId.toString() }, 'Execution recorded');
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: bigint, update: Partial<AgentStatus>): void {
    const key = agentId.toString();
    const existing = this.agentStatuses.get(key) || {
      agentId,
      isActive: true,
      lastEvaluation: 0,
      pendingExecutions: 0,
      totalExecutions: 0,
    };
    
    this.agentStatuses.set(key, { ...existing, ...update });
  }

  /**
   * Handle HTTP requests
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const path = url.pathname;

    try {
      if (path === '/api/health') {
        this.sendJson(res, { status: 'ok', timestamp: Date.now() });
      } else if (path === '/api/executions') {
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const agentId = url.searchParams.get('agentId');
        
        let filtered = this.executions;
        if (agentId) {
          filtered = filtered.filter(e => e.agentId.toString() === agentId);
        }
        
        this.sendJson(res, {
          executions: filtered.slice(0, limit).map(e => ({
            ...e,
            agentId: e.agentId.toString(),
          })),
          total: filtered.length,
        });
      } else if (path === '/api/agents/status') {
        const statuses = Array.from(this.agentStatuses.values()).map(s => ({
          ...s,
          agentId: s.agentId.toString(),
        }));
        this.sendJson(res, { agents: statuses });
      } else if (path === '/api/stats') {
        const totalExecutions = this.executions.length;
        const successfulExecutions = this.executions.filter(e => e.success).length;
        const failedExecutions = totalExecutions - successfulExecutions;
        const stateChannelExecutions = this.executions.filter(e => e.executionMode === 'state-channel').length;
        const onChainExecutions = this.executions.filter(e => e.executionMode === 'on-chain').length;
        
        this.sendJson(res, {
          totalExecutions,
          successfulExecutions,
          failedExecutions,
          stateChannelExecutions,
          onChainExecutions,
          activeAgents: this.agentStatuses.size,
          uptime: process.uptime(),
        });
      } else if (path === '/api/config') {
        this.sendJson(res, {
          chainId: this.config.chainId,
          strategyAgent: this.config.strategyAgentAddress,
          pollInterval: this.config.pollIntervalMs,
          yellowSandbox: this.config.yellowUseSandbox,
        });
      } else {
        res.writeHead(404);
        this.sendJson(res, { error: 'Not found' });
      }
    } catch (error) {
      logger.error({ error, path }, 'API error');
      res.writeHead(500);
      this.sendJson(res, { error: 'Internal server error' });
    }
  }

  private sendJson(res: ServerResponse, data: unknown): void {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  }

  /**
   * Start the API server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      
      this.server.on('error', (error) => {
        logger.error({ error }, 'API server error');
        reject(error);
      });

      this.server.listen(this.port, () => {
        logger.info({ port: this.port }, 'API server started');
        resolve();
      });
    });
  }

  /**
   * Stop the API server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export function createApiServer(config: Config, port?: number): ApiServer {
  return new ApiServer(config, port);
}
