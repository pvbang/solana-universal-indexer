import { Router, Request, Response } from 'express';
import { IndexerEngine } from '../indexer/engine.js';
import { DatabaseManager } from '../db/manager.js';
import { logger } from '../utils/logger.js';

export const indexerRouter = Router();
const indexer = IndexerEngine.getInstance();
const db = DatabaseManager.getInstance();

/** POST /api/indexer/start - Start indexing for a schema */
indexerRouter.post('/start', async (req: Request, res: Response) => {
  try {
    const { schemaId } = req.body;
    if (!schemaId) {
      return res.status(400).json({ error: 'schemaId is required' });
    }

    const pool = db.getPool();
    const result = await pool.query('SELECT * FROM indexer_schemas WHERE id = $1', [schemaId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schema not found' });
    }

    const row = result.rows[0];
    const schema = {
      id: row.id,
      name: row.name,
      programId: row.program_id,
      instructions: row.instructions,
      fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : row.fields,
      description: row.description,
      version: row.version,
      tableName: row.table_name,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    await indexer.startIndexing(schema);

    // Update status
    await pool.query(
      `INSERT INTO indexer_status (schema_id, is_running, started_at)
       VALUES ($1, true, NOW())
       ON CONFLICT (schema_id) DO UPDATE SET is_running = true, started_at = NOW(), updated_at = NOW()`,
      [schemaId]
    );

    res.json({ message: 'Indexing started', schemaId, schemaName: schema.name });
  } catch (error: any) {
    logger.error('Failed to start indexer', { error: error.message });
    res.status(500).json({ error: 'Failed to start indexer' });
  }
});

/** POST /api/indexer/stop - Stop indexing for a schema */
indexerRouter.post('/stop', async (req: Request, res: Response) => {
  try {
    const { schemaId } = req.body;
    if (!schemaId) {
      return res.status(400).json({ error: 'schemaId is required' });
    }

    await indexer.stopIndexing(schemaId);

    const pool = db.getPool();
    await pool.query(
      `UPDATE indexer_status SET is_running = false, updated_at = NOW() WHERE schema_id = $1`,
      [schemaId]
    );

    res.json({ message: 'Indexing stopped', schemaId });
  } catch (error: any) {
    logger.error('Failed to stop indexer', { error: error.message });
    res.status(500).json({ error: 'Failed to stop indexer' });
  }
});

/** GET /api/indexer/status - Get all indexer statuses */
indexerRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const pool = db.getPool();
    const result = await pool.query(`
      SELECT s.id, s.name, s.program_id, st.is_running, st.last_processed_slot,
             st.total_indexed, st.error_count, st.started_at
      FROM indexer_schemas s
      LEFT JOIN indexer_status st ON s.id = st.schema_id
      WHERE s.is_active = true
      ORDER BY s.created_at DESC
    `);

    res.json(result.rows.map(row => ({
      schemaId: row.id,
      schemaName: row.name,
      programId: row.program_id,
      isRunning: row.is_running || false,
      lastProcessedSlot: row.last_processed_slot || 0,
      totalIndexed: row.total_indexed || 0,
      errorCount: row.error_count || 0,
      startedAt: row.started_at,
    })));
  } catch (error: any) {
    logger.error('Failed to get indexer status', { error: error.message });
    res.status(500).json({ error: 'Failed to get indexer status' });
  }
});

/** POST /api/indexer/backfill - Backfill historical data */
indexerRouter.post('/backfill', async (req: Request, res: Response) => {
  try {
    const { schemaId, startSlot, endSlot } = req.body;
    if (!schemaId || !startSlot) {
      return res.status(400).json({ error: 'schemaId and startSlot are required' });
    }

    const pool = db.getPool();
    const result = await pool.query('SELECT * FROM indexer_schemas WHERE id = $1', [schemaId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schema not found' });
    }

    const row = result.rows[0];
    const schema = {
      id: row.id,
      name: row.name,
      programId: row.program_id,
      instructions: row.instructions,
      fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : row.fields,
      description: row.description,
      version: row.version,
      tableName: row.table_name,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    // Run backfill in background
    indexer.backfill(schema, startSlot, endSlot).then(count => {
      logger.info(`Backfill complete for ${schema.name}`, { totalIndexed: count });
    });

    res.json({ message: 'Backfill started', schemaId, startSlot, endSlot });
  } catch (error: any) {
    logger.error('Failed to start backfill', { error: error.message });
    res.status(500).json({ error: 'Failed to start backfill' });
  }
});
