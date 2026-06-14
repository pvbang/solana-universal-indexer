import { Router, Request, Response } from 'express';
import client from 'prom-client';

export const metricsRouter = Router();

// Initialize Prometheus metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Custom metrics
export const transactionsIndexed = new client.Counter({
  name: 'indexer_transactions_indexed_total',
  help: 'Total number of transactions indexed',
  labelNames: ['schema'],
  registers: [register],
});

export const indexingErrors = new client.Counter({
  name: 'indexer_errors_total',
  help: 'Total number of indexing errors',
  labelNames: ['schema', 'type'],
  registers: [register],
});

export const indexingLatency = new client.Histogram({
  name: 'indexer_processing_duration_seconds',
  help: 'Time to process a single transaction',
  labelNames: ['schema'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export const activeSchemas = new client.Gauge({
  name: 'indexer_active_schemas',
  help: 'Number of actively indexing schemas',
  registers: [register],
});

/** GET /metrics - Prometheus metrics endpoint */
metricsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end();
  }
});
