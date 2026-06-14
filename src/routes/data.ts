import { Router, Request, Response } from 'express';
import { DatabaseManager } from '../db/manager.js';
import { QueryParamsSchema } from '../types/schema.js';
import { logger } from '../utils/logger.js';

export const dataRouter = Router();
const db = DatabaseManager.getInstance();

/** GET /api/data/:schema - Query indexed data with filters */
dataRouter.get('/:schema', async (req: Request, res: Response) => {
  try {
    const pool = db.getPool();

    // Verify schema exists
    const schemaResult = await pool.query(
      'SELECT table_name FROM indexer_schemas WHERE name = $1',
      [req.params.schema]
    );

    if (schemaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schema not found' });
    }

    const tableName = schemaResult.rows[0].table_name;

    // Parse query params
    const parsed = QueryParamsSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query params', details: parsed.error.issues });
    }

    const { page, limit, sortBy, sortOrder, filters } = parsed.data;

    const result = await db.queryData(
      tableName,
      filters || {},
      page,
      limit,
      sortBy || 'slot',
      sortOrder
    );

    res.json({
      data: result.data,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error: any) {
    logger.error('Failed to query data', { error: error.message });
    res.status(500).json({ error: 'Failed to query data' });
  }
});

/** GET /api/data/:schema/aggregate - Aggregation queries */
dataRouter.get('/:schema/aggregate', async (req: Request, res: Response) => {
  try {
    const pool = db.getPool();

    const schemaResult = await pool.query(
      'SELECT table_name FROM indexer_schemas WHERE name = $1',
      [req.params.schema]
    );

    if (schemaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schema not found' });
    }

    const tableName = schemaResult.rows[0].table_name;
    const { field, operation, groupBy } = req.query;

    if (!field || !operation) {
      return res.status(400).json({ error: 'field and operation are required' });
    }

    const validOps = ['count', 'sum', 'avg', 'min', 'max'];
    if (!validOps.includes(operation as string)) {
      return res.status(400).json({ error: `operation must be one of: ${validOps.join(', ')}` });
    }

    let sql: string;
    if (groupBy) {
      sql = `SELECT ${groupBy} as group_key, ${operation}(${field}) as value FROM ${tableName} GROUP BY ${groupBy} ORDER BY value DESC LIMIT 100`;
    } else {
      sql = `SELECT ${operation}(${field}) as value FROM ${tableName}`;
    }

    const result = await pool.query(sql);
    res.json({ data: result.rows });
  } catch (error: any) {
    logger.error('Failed to aggregate data', { error: error.message });
    res.status(500).json({ error: 'Failed to aggregate data' });
  }
});

/** GET /api/data/:schema/:id - Get specific record */
dataRouter.get('/:schema/:id', async (req: Request, res: Response) => {
  try {
    const pool = db.getPool();

    const schemaResult = await pool.query(
      'SELECT table_name FROM indexer_schemas WHERE name = $1',
      [req.params.schema]
    );

    if (schemaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schema not found' });
    }

    const tableName = schemaResult.rows[0].table_name;
    const result = await pool.query(`SELECT * FROM ${tableName} WHERE id = $1`, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error('Failed to get record', { error: error.message });
    res.status(500).json({ error: 'Failed to get record' });
  }
});
