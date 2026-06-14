import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { schemaRouter } from './routes/schemas.js';
import { dataRouter } from './routes/data.js';
import { indexerRouter } from './routes/indexer.js';
import { metricsRouter } from './routes/metrics.js';
import { DatabaseManager } from './db/manager.js';
import { IndexerEngine } from './indexer/engine.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    data: {
      service: 'solana-universal-indexer',
      uptime: process.uptime(),
      version: '1.0.0',
    },
  });
});

// API Routes
app.use(`${config.apiPrefix}/schemas`, schemaRouter);
app.use(`${config.apiPrefix}/data`, dataRouter);
app.use(`${config.apiPrefix}/indexer`, indexerRouter);
app.use('/metrics', metricsRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Bootstrap
async function bootstrap() {
  try {
    // Initialize database
    const db = DatabaseManager.getInstance();
    await db.connect();
    logger.info('Database connected');

    // Initialize indexer engine
    const indexer = IndexerEngine.getInstance();
    await indexer.initialize();
    logger.info('Indexer engine initialized');

    // Start server
    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
      logger.info(`API prefix: ${config.apiPrefix}`);
    });
  } catch (error) {
    logger.error('Failed to bootstrap application', { error });
    process.exit(1);
  }
}

bootstrap();

export { app };
