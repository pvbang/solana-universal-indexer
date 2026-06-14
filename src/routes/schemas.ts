import { Router, Request, Response } from 'express';
import { DatabaseManager } from '../db/manager.js';
import { CreateSchemaSchema, IndexerSchema } from '../types/schema.js';
import { logger } from '../utils/logger.js';

export const schemaRouter = Router();
const db = DatabaseManager.getInstance();

/** POST /api/schemas - Create a new indexing schema */
schemaRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = CreateSchemaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const tableName = `idx_${input.name.replace(/-/g, '_')}`;

    const pool = db.getPool();
    const result = await pool.query(
      `INSERT INTO indexer_schemas (name, program_id, instructions, fields, description, version, table_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [input.name, input.programId, input.instructions, JSON.stringify(input.fields),
       input.description || null, input.version, tableName]
    );

    const schema: IndexerSchema = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      programId: result.rows[0].program_id,
      instructions: result.rows[0].instructions,
      fields: JSON.parse(result.rows[0].fields),
      description: result.rows[0].description,
      version: result.rows[0].version,
      tableName: result.rows[0].table_name,
      isActive: result.rows[0].is_active,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
    };

    // Create the dynamic table
    await db.createDynamicTable(schema);

    logger.info(`Schema created: ${schema.name}`, { id: schema.id, tableName });
    res.status(201).json(schema);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Schema with this name already exists' });
    }
    logger.error('Failed to create schema', { error: error.message });
    res.status(500).json({ error: 'Failed to create schema' });
  }
});

/** GET /api/schemas - List all schemas */
schemaRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = db.getPool();
    const result = await pool.query(
      'SELECT * FROM indexer_schemas ORDER BY created_at DESC'
    );
    res.json(result.rows.map(mapRow));
  } catch (error: any) {
    logger.error('Failed to list schemas', { error: error.message });
    res.status(500).json({ error: 'Failed to list schemas' });
  }
});

/** GET /api/schemas/:id - Get schema by ID */
schemaRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const pool = db.getPool();
    const result = await pool.query('SELECT * FROM indexer_schemas WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schema not found' });
    }
    res.json(mapRow(result.rows[0]));
  } catch (error: any) {
    logger.error('Failed to get schema', { error: error.message });
    res.status(500).json({ error: 'Failed to get schema' });
  }
});

/** DELETE /api/schemas/:id - Delete schema */
schemaRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const pool = db.getPool();
    const result = await pool.query(
      'DELETE FROM indexer_schemas WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schema not found' });
    }
    // Drop the dynamic table
    await pool.query(`DROP TABLE IF EXISTS ${result.rows[0].table_name}`);
    res.json({ message: 'Schema deleted', id: req.params.id });
  } catch (error: any) {
    logger.error('Failed to delete schema', { error: error.message });
    res.status(500).json({ error: 'Failed to delete schema' });
  }
});

function mapRow(row: any): IndexerSchema {
  return {
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
}
