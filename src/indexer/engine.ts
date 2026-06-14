import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  Commitment,
} from '@solana/web3.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { DatabaseManager } from '../db/manager.js';
import { IndexerSchema, SolanaTransaction } from '../types/schema.js';

export class IndexerEngine {
  private static instance: IndexerEngine;
  private connection: Connection;
  private db: DatabaseManager;
  private activeSubscriptions: Map<string, number> = new Map();
  private isInitialized = false;

  private constructor() {
    this.connection = new Connection(config.solanaRpcUrl, {
      wsEndpoint: config.solanaWsUrl,
      commitment: config.indexerCommitment,
    });
    this.db = DatabaseManager.getInstance();
  }

  static getInstance(): IndexerEngine {
    if (!IndexerEngine.instance) {
      IndexerEngine.instance = new IndexerEngine();
    }
    return IndexerEngine.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Verify Solana connection
    const version = await this.connection.getVersion();
    logger.info('Connected to Solana', { version: version['solana-core'] });

    this.isInitialized = true;
  }

  /** Start indexing for a specific schema */
  async startIndexing(schema: IndexerSchema): Promise<void> {
    if (this.activeSubscriptions.has(schema.id)) {
      logger.warn(`Indexing already active for schema: ${schema.name}`);
      return;
    }

    const programId = new PublicKey(schema.programId);

    // Subscribe to program logs
    const subscriptionId = this.connection.onLogs(
      programId,
      async (logs) => {
        try {
          await this.processTransaction(schema, logs.signature);
        } catch (error) {
          logger.error(`Error processing transaction for ${schema.name}`, {
            signature: logs.signature,
            error: (error as Error).message,
          });
        }
      },
      config.indexerCommitment as Commitment,
    );

    this.activeSubscriptions.set(schema.id, subscriptionId);
    logger.info(`Started indexing for schema: ${schema.name}`, { programId: schema.programId });
  }

  /** Stop indexing for a specific schema */
  async stopIndexing(schemaId: string): Promise<void> {
    const subscriptionId = this.activeSubscriptions.get(schemaId);
    if (subscriptionId !== undefined) {
      await this.connection.removeOnLogsListener(subscriptionId);
      this.activeSubscriptions.delete(schemaId);
      logger.info(`Stopped indexing for schema: ${schemaId}`);
    }
  }

  /** Process a single transaction */
  private async processTransaction(schema: IndexerSchema, signature: string): Promise<void> {
    const tx = await this.connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta || tx.meta.err) return;

    const records = this.extractData(schema, tx, signature);
    if (records.length > 0) {
      await this.db.insertData(schema.tableName, records);
      logger.debug(`Indexed ${records.length} records from ${signature}`);
    }
  }

  /** Extract structured data from a parsed transaction */
  private extractData(
    schema: IndexerSchema,
    tx: ParsedTransactionWithMeta,
    signature: string,
  ): Record<string, unknown>[] {
    const records: Record<string, unknown>[] = [];
    const instructions = tx.transaction.message.instructions;

    for (const ix of instructions) {
      // Check if this instruction belongs to our program
      if ('programId' in ix && ix.programId.toBase58() === schema.programId) {
        // For parsed instructions
        if ('parsed' in ix && typeof ix.parsed === 'object') {
          const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> };
          if (parsed.type && schema.instructions.includes(parsed.type)) {
            const record: Record<string, unknown> = {
              signature,
              slot: tx.slot,
              block_time: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
              instruction: parsed.type,
            };

            // Map parsed fields to schema fields
            if (parsed.info) {
              for (const field of schema.fields) {
                record[field.name] = parsed.info[field.name] ?? null;
              }
            }

            records.push(record);
          }
        }
      }
    }

    return records;
  }

  /** Backfill historical data for a schema */
  async backfill(schema: IndexerSchema, startSlot: number, endSlot?: number): Promise<number> {
    const currentSlot = endSlot || await this.connection.getSlot();
    let totalIndexed = 0;
    let slot = startSlot;

    logger.info(`Starting backfill for ${schema.name}`, { startSlot, endSlot: currentSlot });

    while (slot <= currentSlot) {
      const batchEnd = Math.min(slot + config.indexerBatchSize, currentSlot);

      try {
        const signatures = await this.connection.getSignaturesForAddress(
          new PublicKey(schema.programId),
          { limit: config.indexerBatchSize },
          config.indexerCommitment as Commitment,
        );

        for (const sig of signatures) {
          if (sig.slot >= slot && sig.slot <= batchEnd) {
            await this.processTransaction(schema, sig.signature);
            totalIndexed++;
          }
        }
      } catch (error) {
        logger.error(`Backfill error at slot ${slot}`, { error: (error as Error).message });
      }

      slot = batchEnd + 1;
    }

    logger.info(`Backfill complete for ${schema.name}`, { totalIndexed });
    return totalIndexed;
  }

  /** Get status of all active indexers */
  getStatus(): Map<string, boolean> {
    const status = new Map<string, boolean>();
    for (const [schemaId] of this.activeSubscriptions) {
      status.set(schemaId, true);
    }
    return status;
  }

  /** Shutdown all subscriptions */
  async shutdown(): Promise<void> {
    for (const [schemaId] of this.activeSubscriptions) {
      await this.stopIndexing(schemaId);
    }
    logger.info('All indexer subscriptions stopped');
  }
}
