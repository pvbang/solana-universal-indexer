import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Solana
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  solanaWsUrl: process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/solana_indexer',
  databasePoolSize: parseInt(process.env.DATABASE_POOL_SIZE || '20'),

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // API
  port: parseInt(process.env.PORT || '3000'),
  apiPrefix: process.env.API_PREFIX || '/api',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),

  // Indexer
  indexerBatchSize: parseInt(process.env.INDEXER_BATCH_SIZE || '100'),
  indexerRetryDelay: parseInt(process.env.INDEXER_RETRY_DELAY || '5000'),
  indexerMaxRetries: parseInt(process.env.INDEXER_MAX_RETRIES || '3'),
  indexerCommitment: (process.env.INDEXER_COMMITMENT || 'confirmed') as 'confirmed' | 'finalized',

  // Monitoring
  metricsEnabled: process.env.METRICS_ENABLED === 'true',
  metricsPort: parseInt(process.env.METRICS_PORT || '9090'),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logFormat: process.env.LOG_FORMAT || 'json',
} as const;
